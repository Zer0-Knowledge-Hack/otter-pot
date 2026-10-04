import { describe, expect, it } from "vitest";
import { ConsensusLedger } from "../../src/consensus/ledger";
import type { LedgerStorage } from "../../src/consensus/ledger";
import type { LedgerState } from "../../src/consensus/core";

const WINNER = "0x1111111111111111111111111111111111111111";
const TX = "0xfeed000000000000000000000000000000000000000000000000000000000000";
const NOW = 5_000_000;

/**
 * Storage whose reads and writes yield to the event loop, like a real Durable Object
 * storage does. Without a serial runner, interleaved read-modify-write cycles would
 * lose updates, so the concurrency tests below exercise the real guarantee.
 */
class FakeLedgerStorage implements LedgerStorage {
  failNextPut = false;

  constructor(private current: LedgerState | undefined = undefined) {}

  async get(): Promise<LedgerState | undefined> {
    await new Promise((resolve) => setTimeout(resolve, 1));
    return this.current;
  }

  async put(state: LedgerState): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, 1));
    if (this.failNextPut) {
      this.failNextPut = false;
      throw new Error("storage put failed");
    }
    this.current = state;
  }
}

const wallet = (n: number): string => `0x${n.toString(16).padStart(40, "0")}`;

describe("ConsensusLedger — atomic voting", () => {
  it("stores all 5 concurrent votes and reports the consensus trigger exactly once", async () => {
    const ledger = new ConsensusLedger(new FakeLedgerStorage());

    const results = await Promise.all(
      [1, 2, 3, 4, 5].map((n) => ledger.vote(wallet(n), WINNER, 5)),
    );

    const triggers = results.filter((r) => r.kind === "recorded" && r.consensusTriggered);
    expect(triggers).toHaveLength(1);

    const status = await ledger.snapshot();
    expect(status.confirmationsCount).toBe(5);
    expect(status.phase).toBe("consensus");
    expect(status.winner).toBe(WINNER);
  });

  it("with a lower threshold, one call triggers consensus and the rest are frozen", async () => {
    const ledger = new ConsensusLedger(new FakeLedgerStorage());

    const results = await Promise.all(
      [1, 2, 3, 4, 5].map((n) => ledger.vote(wallet(n), WINNER, 3)),
    );

    expect(results.filter((r) => r.kind === "recorded" && r.consensusTriggered)).toHaveLength(1);
    expect(results.filter((r) => r.kind === "frozen")).toHaveLength(2);
    expect((await ledger.snapshot()).confirmationsCount).toBe(3);
  });

  it("persists across ledger instances over the same storage", async () => {
    const storage = new FakeLedgerStorage();
    const first = new ConsensusLedger(storage);
    await first.vote(wallet(1), WINNER, 2);
    await first.vote(wallet(2), WINNER, 2);

    const second = new ConsensusLedger(storage);
    const status = await second.snapshot();
    expect(status.confirmationsCount).toBe(2);
    expect(status.phase).toBe("consensus");
    expect(status.winner).toBe(WINNER);
  });

  it("returns the empty collecting snapshot for a challenge never voted on", async () => {
    const status = await new ConsensusLedger(new FakeLedgerStorage()).snapshot();
    expect(status).toEqual({
      confirmationsCount: 0,
      threshold: null,
      consensusReached: false,
      phase: "collecting",
      attempt: 0,
    });
  });
});

describe("ConsensusLedger — single in-flight submission", () => {
  async function inConsensus(): Promise<ConsensusLedger> {
    const ledger = new ConsensusLedger(new FakeLedgerStorage(), () => NOW);
    await ledger.vote(wallet(1), WINNER, 1);
    return ledger;
  }

  it("grants exactly one of two concurrent beginSubmit calls", async () => {
    const ledger = await inConsensus();

    const results = await Promise.all([ledger.beginSubmit(NOW), ledger.beginSubmit(NOW)]);

    expect(results.filter((r) => r.granted)).toHaveLength(1);
    expect(results.filter((r) => !r.granted)).toEqual([{ granted: false, phase: "submitting" }]);
  });

  it("runs the full lifecycle and keeps the tx hash across instances", async () => {
    const storage = new FakeLedgerStorage();
    const ledger = new ConsensusLedger(storage, () => NOW);
    await ledger.vote(wallet(1), WINNER, 1);

    const begin = await ledger.beginSubmit(NOW);
    expect(begin).toEqual({ granted: true, attempt: 1, winner: WINNER });
    expect(await ledger.markSubmitted(1, TX)).toEqual({ ok: true, phase: "submitted" });
    expect(await ledger.markConfirmed(1, TX)).toEqual({ ok: true, phase: "confirmed", firstConfirmation: true });

    const reopened = await new ConsensusLedger(storage).snapshot();
    expect(reopened).toMatchObject({ phase: "confirmed", txHash: TX, attempt: 1 });
  });

  it("fences a stale attempt after the lease was taken over", async () => {
    const ledger = await inConsensus();
    await ledger.beginSubmit(NOW);
    const takeover = await ledger.beginSubmit(NOW + 180_000);
    expect(takeover).toEqual({ granted: true, attempt: 2, winner: WINNER });

    expect(await ledger.markFailed(1, "late")).toEqual({
      ok: false,
      reason: "stale_attempt",
      phase: "submitting",
    });
  });

  it("a failed storage write does not poison later commands", async () => {
    const storage = new FakeLedgerStorage();
    const ledger = new ConsensusLedger(storage);

    storage.failNextPut = true;
    await expect(ledger.vote(wallet(1), WINNER, 2)).rejects.toThrow("storage put failed");

    // The failed command left no trace and the queue keeps serving.
    expect((await ledger.snapshot()).confirmationsCount).toBe(0);
    expect(await ledger.vote(wallet(2), WINNER, 2)).toEqual({ kind: "recorded", consensusTriggered: false });
  });
});
