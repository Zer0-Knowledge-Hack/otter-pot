import { describe, expect, it } from "vitest";
import {
  LEASE_MS,
  beginSubmit,
  emptyLedger,
  markConfirmed,
  markFailed,
  markSubmitted,
  snapshot,
  vote,
} from "../../src/consensus/core";
import type { LedgerState } from "../../src/consensus/core";

const ALICE = "0xa1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1";
const BOB = "0xb2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2";
const CARLA = "0xc3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3";
const WINNER_A = "0x1111111111111111111111111111111111111111";
const WINNER_B = "0x2222222222222222222222222222222222222222";
const TX = "0xfeed000000000000000000000000000000000000000000000000000000000000";
const NOW = 1_000_000;

/** Leaves the ledger in `consensus` for WINNER_A (threshold 2). */
function inConsensus(): LedgerState {
  let state = emptyLedger();
  state = vote(state, ALICE, WINNER_A, 2).state;
  state = vote(state, BOB, WINNER_A, 2).state;
  return state;
}

/** Leaves the ledger in `submitting` (attempt 1). */
function inSubmitting(): LedgerState {
  const begin = beginSubmit(inConsensus(), NOW);
  return begin.state;
}

describe("consensus core — voting", () => {
  it("stays in collecting below the threshold", () => {
    const first = vote(emptyLedger(), ALICE, WINNER_A, 3);
    expect(first.result).toEqual({ kind: "recorded", consensusTriggered: false });
    expect(first.state.phase).toBe("collecting");
    expect(first.state.votes).toEqual({ [ALICE]: WINNER_A });
  });

  it("moves to consensus exactly once, when the threshold is reached", () => {
    let state = emptyLedger();
    state = vote(state, ALICE, WINNER_A, 3).state;
    state = vote(state, BOB, WINNER_A, 3).state;
    const third = vote(state, CARLA, WINNER_A, 3);

    expect(third.result).toEqual({ kind: "recorded", consensusTriggered: true, winner: WINNER_A });
    expect(third.state.phase).toBe("consensus");
    expect(third.state.winner).toBe(WINNER_A);

    // A fourth vote never triggers again: the ledger is frozen.
    const fourth = vote(third.state, "0xdddd", WINNER_A, 3);
    expect(fourth.result).toEqual({ kind: "frozen", phase: "consensus", winner: WINNER_A });
  });

  it("split votes do not trigger consensus", () => {
    let state = emptyLedger();
    state = vote(state, ALICE, WINNER_A, 3).state;
    state = vote(state, BOB, WINNER_A, 3).state;
    const split = vote(state, CARLA, WINNER_B, 3);
    expect(split.result).toEqual({ kind: "recorded", consensusTriggered: false });
    expect(split.state.phase).toBe("collecting");
  });

  it("a wallet that votes twice replaces its vote instead of duplicating it", () => {
    let state = emptyLedger();
    state = vote(state, ALICE, WINNER_A, 2).state;
    state = vote(state, ALICE, WINNER_B, 2).state;
    const bob = vote(state, BOB, WINNER_A, 2);
    // WINNER_A has a single real vote (Bob), so consensus is not reached.
    expect(bob.result).toEqual({ kind: "recorded", consensusTriggered: false });
    expect(Object.keys(bob.state.votes)).toHaveLength(2);
  });

  it("fixes the threshold with the first vote and ignores later values", () => {
    let state = emptyLedger();
    state = vote(state, ALICE, WINNER_A, 3).state;
    state = vote(state, BOB, WINNER_A, 3).state;
    const carla = vote(state, CARLA, WINNER_B, 2);

    expect(carla.result).toEqual({ kind: "recorded", consensusTriggered: false });
    expect(carla.state.threshold).toBe(3);
  });

  it("rejects a vote without a wallet and records nothing", () => {
    const empty = vote(emptyLedger(), "  ", WINNER_A, 2);
    expect(empty.result).toEqual({ kind: "invalid_wallet" });
    expect(empty.state).toEqual(emptyLedger());
  });

  it("freezes votes in every phase after collecting without changing state", () => {
    const phases: LedgerState[] = [
      inConsensus(),
      inSubmitting(),
      markSubmitted(inSubmitting(), 1, TX, NOW).state,
      markConfirmed(inSubmitting(), 1, TX).state,
      markFailed(inSubmitting(), 1, "boom").state,
    ];
    expect(phases.map((s) => s.phase)).toEqual([
      "consensus",
      "submitting",
      "submitted",
      "confirmed",
      "failed",
    ]);

    for (const frozen of phases) {
      const late = vote(frozen, CARLA, WINNER_B, 2);
      expect(late.result).toEqual({ kind: "frozen", phase: frozen.phase, winner: WINNER_A });
      expect(late.state).toEqual(frozen);
    }
  });
});

describe("consensus core — submission lease and fencing", () => {
  it("grants the submit right from consensus with a lease and attempt 1", () => {
    const begin = beginSubmit(inConsensus(), NOW);
    expect(begin.result).toEqual({ granted: true, attempt: 1, winner: WINNER_A });
    expect(begin.state.phase).toBe("submitting");
    expect(begin.state.leaseUntil).toBe(NOW + LEASE_MS);
  });

  it("denies a second concurrent submit while the lease is active", () => {
    const second = beginSubmit(inSubmitting(), NOW + LEASE_MS - 1);
    expect(second.result).toEqual({ granted: false, phase: "submitting" });
    expect(second.state.attempt).toBe(1);
  });

  it("denies the submit right while still collecting and once confirmed", () => {
    expect(beginSubmit(emptyLedger(), NOW).result).toEqual({ granted: false, phase: "collecting" });
    const confirmed = markConfirmed(inSubmitting(), 1, TX).state;
    expect(beginSubmit(confirmed, NOW).result).toEqual({ granted: false, phase: "confirmed" });
  });

  it("an expired submitting lease is treated as failed(lease_expired) and granted once", () => {
    const expiredAt = NOW + LEASE_MS;
    const retry = beginSubmit(inSubmitting(), expiredAt);
    expect(retry.result).toEqual({ granted: true, attempt: 2, winner: WINNER_A });
    expect(retry.state.phase).toBe("submitting");

    // Exactly one new right: the next caller sees the fresh lease.
    const again = beginSubmit(retry.state, expiredAt + 1);
    expect(again.result).toEqual({ granted: false, phase: "submitting" });
  });

  it("an expired submitted lease is also recovered with a new attempt", () => {
    const submitted = markSubmitted(inSubmitting(), 1, TX, NOW).state;
    expect(beginSubmit(submitted, NOW + LEASE_MS - 1).result).toEqual({
      granted: false,
      phase: "submitted",
    });
    const retry = beginSubmit(submitted, NOW + LEASE_MS);
    expect(retry.result).toEqual({ granted: true, attempt: 2, winner: WINNER_A });
  });

  it("a late holder of a superseded attempt cannot overwrite the new attempt", () => {
    const retry = beginSubmit(inSubmitting(), NOW + LEASE_MS);
    // A late holder of attempt 1 cannot overwrite the new attempt.
    const late = markFailed(retry.state, 1, "late failure");
    expect(late.result).toEqual({ ok: false, reason: "stale_attempt", phase: "submitting" });
    expect(late.state).toEqual(retry.state);
  });

  it("fences every mark call carrying a stale attempt", () => {
    const retry = beginSubmit(inSubmitting(), NOW + LEASE_MS).state;
    expect(markSubmitted(retry, 1, TX, NOW).result).toMatchObject({ ok: false, reason: "stale_attempt" });
    expect(markConfirmed(retry, 1, TX).result).toMatchObject({ ok: false, reason: "stale_attempt" });
    expect(markFailed(retry, 1, "x").result).toMatchObject({ ok: false, reason: "stale_attempt" });
    expect(retry.phase).toBe("submitting");
    expect(retry.attempt).toBe(2);
  });

  it("attempt numbers only grow across failure and retry", () => {
    const failed = markFailed(inSubmitting(), 1, "send failed").state;
    const second = beginSubmit(failed, NOW + 10);
    expect(second.result).toEqual({ granted: true, attempt: 2, winner: WINNER_A });
    const failedAgain = markFailed(second.state, 2, "again").state;
    expect(beginSubmit(failedAgain, NOW + 20).result).toEqual({ granted: true, attempt: 3, winner: WINNER_A });
  });
});

describe("consensus core — tx outcome", () => {
  it("submitting -> submitted records the tx hash and renews the lease", () => {
    const later = NOW + 60_000;
    const submitted = markSubmitted(inSubmitting(), 1, TX, later);
    expect(submitted.result).toEqual({ ok: true, phase: "submitted" });
    expect(submitted.state.txHash).toBe(TX);
    expect(submitted.state.leaseUntil).toBe(later + LEASE_MS);
  });

  it("submitted -> confirmed keeps the tx hash and flags the first confirmation", () => {
    const submitted = markSubmitted(inSubmitting(), 1, TX, NOW).state;
    const confirmed = markConfirmed(submitted, 1, TX);
    expect(confirmed.result).toEqual({ ok: true, phase: "confirmed", firstConfirmation: true });
    expect(confirmed.state.txHash).toBe(TX);
  });

  it("confirms without a tx when the challenge was already settled on-chain", () => {
    const confirmed = markConfirmed(inSubmitting(), 1, null);
    expect(confirmed.result).toEqual({ ok: true, phase: "confirmed", firstConfirmation: true });
    expect(confirmed.state.txHash).toBeNull();
  });

  it("a repeated confirmation is not a first confirmation", () => {
    const confirmed = markConfirmed(inSubmitting(), 1, TX).state;
    const repeat = markConfirmed(confirmed, 1, TX);
    expect(repeat.result).toEqual({ ok: true, phase: "confirmed", firstConfirmation: false });
  });

  it("markFailed stores the reason; marks are invalid outside submitting/submitted", () => {
    const failed = markFailed(inSubmitting(), 1, "receipt reverted");
    expect(failed.result).toEqual({ ok: true, phase: "failed" });
    expect(failed.state.failureReason).toBe("receipt reverted");

    const invalid = markSubmitted(inConsensus(), 0, TX, NOW);
    expect(invalid.result).toEqual({ ok: false, reason: "invalid_phase", phase: "consensus" });
  });
});

describe("consensus core — snapshot", () => {
  it("exposes phase, txHash and failureReason only when they apply", () => {
    expect(snapshot(emptyLedger())).toEqual({
      confirmationsCount: 0,
      threshold: null,
      consensusReached: false,
      phase: "collecting",
      attempt: 0,
    });

    const failed = markFailed(inSubmitting(), 1, "receipt reverted").state;
    expect(snapshot(failed)).toEqual({
      confirmationsCount: 2,
      threshold: 2,
      consensusReached: true,
      winner: WINNER_A,
      phase: "failed",
      failureReason: "receipt reverted",
      attempt: 1,
    });

    const confirmed = markConfirmed(inSubmitting(), 1, TX).state;
    expect(snapshot(confirmed)).toMatchObject({ phase: "confirmed", txHash: TX });
    expect(snapshot(confirmed)).not.toHaveProperty("failureReason");
  });
});
