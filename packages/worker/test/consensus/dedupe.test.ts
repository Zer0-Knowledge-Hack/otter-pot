import { describe, expect, it } from "vitest";
import {
  InMemoryUpdateDedupe,
  RETENTION,
  UpdateDedupeLog,
  emptyDedupe,
  markIfNew,
} from "../../src/consensus/dedupe";
import type { DedupeState, DedupeStorage } from "../../src/consensus/dedupe";

class FakeDedupeStorage implements DedupeStorage {
  constructor(private current: DedupeState | undefined = undefined) {}

  async get(): Promise<DedupeState | undefined> {
    await new Promise((resolve) => setTimeout(resolve, 1));
    return this.current;
  }

  async put(state: DedupeState): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, 1));
    this.current = state;
  }
}

describe("dedupe core — FIFO window", () => {
  it("marks an unseen id as new and a seen id as duplicate", () => {
    const first = markIfNew(emptyDedupe(), 100);
    expect(first.isNew).toBe(true);
    expect(first.state.ids).toEqual([100]);

    const again = markIfNew(first.state, 100);
    expect(again.isNew).toBe(false);
    expect(again.state).toBe(first.state);
  });

  it("evicts the oldest id once the retention is exceeded, keeping the newest", () => {
    let state: DedupeState = emptyDedupe();
    for (const id of [1, 2, 3]) state = markIfNew(state, id, 3).state;
    expect(state.ids).toEqual([1, 2, 3]);

    const overflow = markIfNew(state, 4, 3);
    expect(overflow.isNew).toBe(true);
    expect(overflow.state.ids).toEqual([2, 3, 4]);
    // The evicted id is forgotten, the newest remains deduped.
    expect(markIfNew(overflow.state, 4, 3).isNew).toBe(false);
    expect(markIfNew(overflow.state, 1, 3).isNew).toBe(true);
  });

  it("uses a retention of 200 by default", () => {
    expect(RETENTION).toBe(200);
    let state: DedupeState = emptyDedupe();
    for (let id = 1; id <= RETENTION + 1; id++) state = markIfNew(state, id).state;

    expect(state.ids).toHaveLength(RETENTION);
    expect(markIfNew(state, 2).isNew).toBe(false); // oldest survivor
    expect(markIfNew(state, RETENTION + 1).isNew).toBe(false); // newest
    expect(markIfNew(state, 1).isNew).toBe(true); // evicted
  });
});

describe("UpdateDedupeLog", () => {
  it("processes redeliveries at most once and survives a new instance", async () => {
    const storage = new FakeDedupeStorage();
    const log = new UpdateDedupeLog(storage);
    expect(await log.markIfNew(100)).toBe(true);
    expect(await log.markIfNew(100)).toBe(false);

    const reopened = new UpdateDedupeLog(storage);
    expect(await reopened.markIfNew(100)).toBe(false);
    expect(await reopened.markIfNew(101)).toBe(true);
  });

  it("lets exactly one of two concurrent identical updates through", async () => {
    const log = new UpdateDedupeLog(new FakeDedupeStorage());
    const results = await Promise.all([log.markIfNew(7), log.markIfNew(7)]);
    expect(results.filter(Boolean)).toHaveLength(1);
  });
});

describe("InMemoryUpdateDedupe — per chat", () => {
  it("dedupes within a chat but processes the same id for a different chat", async () => {
    const dedupe = new InMemoryUpdateDedupe();
    expect(await dedupe.markIfNew("-100", 100)).toBe(true);
    expect(await dedupe.markIfNew("-100", 100)).toBe(false);
    expect(await dedupe.markIfNew("-200", 100)).toBe(true);
  });
});
