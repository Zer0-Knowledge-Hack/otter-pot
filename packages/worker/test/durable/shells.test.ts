import { describe, expect, it } from "vitest";
import { ConfirmationStore } from "../../src/durable/ConfirmationStore";
import { UpdateDedupe } from "../../src/durable/UpdateDedupe";
import type { DurableStateLike } from "../../src/durable/state";

const WINNER = "0x1111111111111111111111111111111111111111";
const VOTER_1 = "0xa1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1";
const VOTER_2 = "0xb2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2";
const TX = "0xfeed000000000000000000000000000000000000000000000000000000000000";

/** Fake `state.storage` over a map; reads and writes yield like the real one. */
function fakeState(map: Map<string, unknown> = new Map()): DurableStateLike & { map: Map<string, unknown> } {
  return {
    map,
    storage: {
      async get<T>(key: string): Promise<T | undefined> {
        await new Promise((resolve) => setTimeout(resolve, 1));
        return map.get(key) as T | undefined;
      },
      async put<T>(key: string, value: T): Promise<void> {
        await new Promise((resolve) => setTimeout(resolve, 1));
        map.set(key, value);
      },
    },
  };
}

function command(body: unknown, method = "POST"): Request {
  return new Request("https://do.local/", {
    method,
    headers: { "Content-Type": "application/json" },
    ...(method === "POST" ? { body: JSON.stringify(body) } : {}),
  });
}

describe("ConfirmationStore shell", () => {
  it("runs vote, beginSubmit and the mark commands through fetch", async () => {
    const shell = new ConfirmationStore(fakeState());

    const vote = await shell.fetch(command({ op: "vote", wallet: VOTER_1, winner: WINNER, threshold: 1 }));
    expect(vote.status).toBe(200);
    expect(await vote.json()).toEqual({ kind: "recorded", consensusTriggered: true, winner: WINNER });

    const begin = await shell.fetch(command({ op: "beginSubmit", now: 1000 }));
    expect(await begin.json()).toEqual({ granted: true, attempt: 1, winner: WINNER });

    const submitted = await shell.fetch(command({ op: "markSubmitted", attempt: 1, txHash: TX }));
    expect(await submitted.json()).toEqual({ ok: true, phase: "submitted" });

    const confirmed = await shell.fetch(command({ op: "markConfirmed", attempt: 1, txHash: TX }));
    expect(await confirmed.json()).toEqual({ ok: true, phase: "confirmed", firstConfirmation: true });

    const status = await shell.fetch(command({ op: "getStatus" }));
    expect(await status.json()).toMatchObject({ phase: "confirmed", txHash: TX, attempt: 1 });
  });

  it("serves concurrent commands atomically (one submit right out of two)", async () => {
    const shell = new ConfirmationStore(fakeState());
    await shell.fetch(command({ op: "vote", wallet: VOTER_1, winner: WINNER, threshold: 1 }));

    const responses = await Promise.all([
      shell.fetch(command({ op: "beginSubmit", now: 1000 })),
      shell.fetch(command({ op: "beginSubmit", now: 1000 })),
    ]);
    const bodies = (await Promise.all(responses.map((r) => r.json()))) as { granted: boolean }[];
    expect(bodies.filter((b) => b.granted)).toHaveLength(1);
  });

  it("persists in a single storage key across shell instances", async () => {
    const state = fakeState();
    await new ConfirmationStore(state).fetch(
      command({ op: "vote", wallet: VOTER_2, winner: WINNER, threshold: 2 }),
    );
    expect(state.map.size).toBe(1);

    const reopened = await new ConfirmationStore(state).fetch(command({ op: "getStatus" }));
    expect(await reopened.json()).toMatchObject({ confirmationsCount: 1, phase: "collecting", threshold: 2 });
  });

  it("rejects unknown ops and malformed bodies with 400, and non-POST with 405", async () => {
    const shell = new ConfirmationStore(fakeState());

    const unknown = await shell.fetch(command({ op: "drainTheVault" }));
    expect(unknown.status).toBe(400);

    const malformed = await shell.fetch(
      new Request("https://do.local/", { method: "POST", body: "not json" }),
    );
    expect(malformed.status).toBe(400);

    const missingField = await shell.fetch(command({ op: "vote", wallet: VOTER_1 }));
    expect(missingField.status).toBe(400);

    const wrongMethod = await shell.fetch(command(undefined, "GET"));
    expect(wrongMethod.status).toBe(405);
  });
});

describe("UpdateDedupe shell", () => {
  it("answers isNew once per update id and persists across instances", async () => {
    const state = fakeState();
    const shell = new UpdateDedupe(state);

    const first = await shell.fetch(command({ op: "markIfNew", updateId: 100 }));
    expect(await first.json()).toEqual({ isNew: true });
    const repeat = await shell.fetch(command({ op: "markIfNew", updateId: 100 }));
    expect(await repeat.json()).toEqual({ isNew: false });

    const reopened = await new UpdateDedupe(state).fetch(command({ op: "markIfNew", updateId: 100 }));
    expect(await reopened.json()).toEqual({ isNew: false });
  });

  it("rejects an unknown op or a non-numeric update id with 400", async () => {
    const shell = new UpdateDedupe(fakeState());
    expect((await shell.fetch(command({ op: "nope", updateId: 1 }))).status).toBe(400);
    expect((await shell.fetch(command({ op: "markIfNew", updateId: "abc" }))).status).toBe(400);
  });
});
