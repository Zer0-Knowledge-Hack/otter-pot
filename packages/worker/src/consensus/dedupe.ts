/**
 * Telegram `update_id` dedupe (#26).
 *
 * Telegram redelivers an update until it gets a 200, so the webhook must be idempotent.
 * State per chat is a bounded FIFO list of recently seen ids: only pending updates are
 * ever redelivered (at most 100 per batch), so 200 ids cover that window at roughly 2 KB
 * per chat. The pure core is `markIfNew`; `UpdateDedupeLog` persists it serially.
 */

import { SerialQueue } from "./serial";

/** Ids kept per chat. Covers Telegram's redelivery window with margin. */
export const RETENTION = 200;

export interface DedupeState {
  /** Oldest first. */
  ids: number[];
}

export interface DedupeTransition {
  state: DedupeState;
  isNew: boolean;
}

export function emptyDedupe(): DedupeState {
  return { ids: [] };
}

export function markIfNew(state: DedupeState, updateId: number, retention: number = RETENTION): DedupeTransition {
  if (state.ids.includes(updateId)) {
    return { state, isNew: false };
  }
  const ids = [...state.ids, updateId];
  // FIFO: drop the oldest ids beyond the limit; the newest always stays deduped.
  return { state: { ids: ids.slice(Math.max(0, ids.length - retention)) }, isNew: true };
}

/** Single-key storage for one chat's dedupe state. */
export interface DedupeStorage {
  get(): Promise<DedupeState | undefined>;
  put(state: DedupeState): Promise<void>;
}

/** Marks ids against one chat's storage, one command at a time. */
export class UpdateDedupeLog {
  private readonly queue = new SerialQueue();

  constructor(
    private readonly storage: DedupeStorage,
    private readonly retention: number = RETENTION,
  ) {}

  /** Resolves `true` the first time an id is seen and `false` for every redelivery. */
  markIfNew(updateId: number): Promise<boolean> {
    return this.queue.run(async () => {
      const current = (await this.storage.get()) ?? emptyDedupe();
      const next = markIfNew(current, updateId, this.retention);
      if (next.isNew) {
        await this.storage.put(next.state);
      }
      return next.isNew;
    });
  }
}

/**
 * What the webhook depends on. `chatKey` selects the per-chat log, so the same
 * `update_id` value arriving for two chats is processed twice.
 */
export interface UpdateDedupeGateway {
  markIfNew(chatKey: string, updateId: number): Promise<boolean>;
}

class InMemoryDedupeStorage implements DedupeStorage {
  private current: DedupeState | undefined;

  async get(): Promise<DedupeState | undefined> {
    return this.current;
  }

  async put(state: DedupeState): Promise<void> {
    this.current = state;
  }
}

/** Dev/test fallback when the Durable Object namespace is not bound. */
export class InMemoryUpdateDedupe implements UpdateDedupeGateway {
  private readonly logs = new Map<string, UpdateDedupeLog>();

  markIfNew(chatKey: string, updateId: number): Promise<boolean> {
    let log = this.logs.get(chatKey);
    if (!log) {
      log = new UpdateDedupeLog(new InMemoryDedupeStorage());
      this.logs.set(chatKey, log);
    }
    return log.markIfNew(updateId);
  }
}
