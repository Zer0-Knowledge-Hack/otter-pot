import { describe, expect, it } from "vitest";
import {
  DurableConsensusGateway,
  DurableUpdateDedupe,
  InMemoryConsensusGateway,
} from "../../src/consensus/gateway";
import type { ConsensusGateway, DurableNamespaceLike } from "../../src/consensus/gateway";
import { InMemoryUpdateDedupe } from "../../src/consensus/dedupe";
import type { UpdateDedupeGateway } from "../../src/consensus/dedupe";
import { ConfirmationStore } from "../../src/durable/ConfirmationStore";
import { UpdateDedupe } from "../../src/durable/UpdateDedupe";
import { fakeNamespace } from "../helpers/durable";

const WINNER = "0x1111111111111111111111111111111111111111";
const OTHER = "0x2222222222222222222222222222222222222222";
const VOTER_1 = "0xa1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1";
const VOTER_2 = "0xb2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2";
const TX = "0xfeed000000000000000000000000000000000000000000000000000000000000";
const NOW = 2_000_000;

const consensusImpls: [string, () => ConsensusGateway][] = [
  ["in-memory", () => new InMemoryConsensusGateway()],
  ["durable", () => new DurableConsensusGateway(fakeNamespace((state) => new ConfirmationStore(state)))],
];

describe.each(consensusImpls)("ConsensusGateway contract — %s", (_name, create) => {
  it("records votes and reports the consensus trigger once", async () => {
    const gateway = create();
    expect(await gateway.vote("7", VOTER_1, WINNER, 2)).toEqual({ kind: "recorded", consensusTriggered: false });
    expect(await gateway.vote("7", VOTER_2, WINNER, 2)).toEqual({
      kind: "recorded",
      consensusTriggered: true,
      winner: WINNER,
    });
    expect(await gateway.vote("7", "0xc3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3", WINNER, 2)).toEqual({
      kind: "frozen",
      phase: "consensus",
      winner: WINNER,
    });
  });

  it("keeps challenges isolated from each other", async () => {
    const gateway = create();
    await gateway.vote("1", VOTER_1, WINNER, 1);
    expect((await gateway.getStatus("1")).phase).toBe("consensus");
    expect(await gateway.getStatus("2")).toEqual({
      challengeId: "2",
      confirmationsCount: 0,
      threshold: null,
      consensusReached: false,
      phase: "collecting",
      attempt: 0,
    });
  });

  it("runs the submission lifecycle and exposes it through getStatus", async () => {
    const gateway = create();
    await gateway.vote("9", VOTER_1, WINNER, 1);

    expect(await gateway.beginSubmit("9", NOW)).toEqual({ granted: true, attempt: 1, winner: WINNER });
    expect(await gateway.beginSubmit("9", NOW)).toEqual({ granted: false, phase: "submitting" });
    expect(await gateway.markSubmitted("9", 1, TX)).toEqual({ ok: true, phase: "submitted" });
    expect(await gateway.markConfirmed("9", 1, TX)).toEqual({
      ok: true,
      phase: "confirmed",
      firstConfirmation: true,
    });

    expect(await gateway.getStatus("9")).toMatchObject({
      challengeId: "9",
      phase: "confirmed",
      txHash: TX,
      winner: WINNER,
    });
  });

  it("records a failure with its reason and rejects stale attempts", async () => {
    const gateway = create();
    await gateway.vote("5", VOTER_1, OTHER, 1);
    await gateway.beginSubmit("5", NOW);

    expect(await gateway.markFailed("5", 99, "stale")).toEqual({
      ok: false,
      reason: "stale_attempt",
      phase: "submitting",
    });
    expect(await gateway.markFailed("5", 1, "receipt reverted")).toEqual({ ok: true, phase: "failed" });
    expect(await gateway.getStatus("5")).toMatchObject({ phase: "failed", failureReason: "receipt reverted" });
  });
});

describe("DurableConsensusGateway — transport errors", () => {
  it("throws when the Durable Object answers with a non-2xx status", async () => {
    const broken: DurableNamespaceLike = {
      idFromName: (name: string) => name,
      get: () => ({ fetch: async () => new Response("boom", { status: 500 }) }),
    };
    await expect(new DurableConsensusGateway(broken).getStatus("1")).rejects.toThrow(/500/);
  });
});

const dedupeImpls: [string, () => UpdateDedupeGateway][] = [
  ["in-memory", () => new InMemoryUpdateDedupe()],
  ["durable", () => new DurableUpdateDedupe(fakeNamespace((state) => new UpdateDedupe(state)))],
];

describe.each(dedupeImpls)("UpdateDedupeGateway contract — %s", (_name, create) => {
  it("ignores redeliveries and dedupes per chat", async () => {
    const dedupe = create();
    expect(await dedupe.markIfNew("-100", 100)).toBe(true);
    expect(await dedupe.markIfNew("-100", 100)).toBe(false);
    expect(await dedupe.markIfNew("-200", 100)).toBe(true);
  });

  it("lets exactly one of two concurrent identical updates through", async () => {
    const dedupe = create();
    const results = await Promise.all([dedupe.markIfNew("-100", 5), dedupe.markIfNew("-100", 5)]);
    expect(results.filter(Boolean)).toHaveLength(1);
  });
});

describe("DurableNamespaceLike", () => {
  it("is satisfied by the real DurableObjectNamespace (compile-time guard)", () => {
    // If a Cloudflare types update breaks this assignment, `npm run check-types` fails.
    const assignable = (namespace: DurableObjectNamespace): DurableNamespaceLike => namespace;
    expect(typeof assignable).toBe("function");
  });
});
