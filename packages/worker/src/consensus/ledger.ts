/**
 * Serial command runner over a one-key `LedgerStorage` (#26).
 *
 * Each command is: get the state, apply a pure transition from `./core`, put the new
 * state, return the result. Commands run one at a time through a promise chain, so a
 * read-modify-write cycle is never interleaved with another one. The storage is
 * injected: a Durable Object passes its `state.storage`, tests pass a fake map.
 */

import {
  beginSubmit,
  emptyLedger,
  markConfirmed,
  markFailed,
  markSubmitted,
  snapshot,
  vote,
} from "./core";
import type {
  BeginSubmitResult,
  ConfirmedResult,
  LedgerSnapshot,
  LedgerState,
  MarkResult,
  Transition,
  VoteResult,
  WalletAddress,
} from "./core";
import { SerialQueue } from "./serial";

/** Single-key storage for one challenge's ledger. */
export interface LedgerStorage {
  get(): Promise<LedgerState | undefined>;
  put(state: LedgerState): Promise<void>;
}

/** In-memory storage, used by the in-memory gateway and as the dev fallback. */
export class InMemoryLedgerStorage implements LedgerStorage {
  private current: LedgerState | undefined;

  async get(): Promise<LedgerState | undefined> {
    return this.current;
  }

  async put(state: LedgerState): Promise<void> {
    this.current = state;
  }
}

export class ConsensusLedger {
  private readonly queue = new SerialQueue();

  constructor(
    private readonly storage: LedgerStorage,
    private readonly clock: () => number = Date.now,
  ) {}

  vote(wallet: WalletAddress, winner: WalletAddress, threshold: number): Promise<VoteResult> {
    return this.command((state) => vote(state, wallet, winner, threshold));
  }

  beginSubmit(now: number): Promise<BeginSubmitResult> {
    return this.command((state) => beginSubmit(state, now));
  }

  markSubmitted(attempt: number, txHash: string): Promise<MarkResult> {
    return this.command((state) => markSubmitted(state, attempt, txHash, this.clock()));
  }

  markConfirmed(attempt: number, txHash: string | null): Promise<ConfirmedResult> {
    return this.command((state) => markConfirmed(state, attempt, txHash));
  }

  markFailed(attempt: number, reason: string): Promise<MarkResult> {
    return this.command((state) => markFailed(state, attempt, reason));
  }

  snapshot(): Promise<LedgerSnapshot> {
    return this.queue.run(async () => snapshot((await this.storage.get()) ?? emptyLedger()));
  }

  /** get -> pure transition -> put, serialized. A transition that changes nothing skips the write. */
  private command<R>(transition: (state: LedgerState) => Transition<R>): Promise<R> {
    return this.queue.run(async () => {
      const current = (await this.storage.get()) ?? emptyLedger();
      const next = transition(current);
      if (next.state !== current) {
        await this.storage.put(next.state);
      }
      return next.result;
    });
  }
}
