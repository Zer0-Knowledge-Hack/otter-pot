/**
 * What the Worker depends on for consensus and update dedupe (#26).
 *
 * `ConsensusGateway` is the only seam between the bot and the ledger: the in-memory
 * implementation serves dev and tests, the Durable Object implementation serves
 * production. Both honor exactly the same contract (see `test/consensus/gateway.test.ts`).
 */

import type { UpdateDedupeGateway } from "./dedupe";
import type { LedgerCommand } from "./commands";
import type {
  BeginSubmitResult,
  ChallengeId,
  ChallengeStatus,
  ConfirmedResult,
  LedgerSnapshot,
  MarkResult,
  VoteResult,
  WalletAddress,
} from "./core";
import { ConsensusLedger, InMemoryLedgerStorage } from "./ledger";

export interface ConsensusGateway {
  vote(id: ChallengeId, wallet: WalletAddress, winner: WalletAddress, threshold: number): Promise<VoteResult>;
  beginSubmit(id: ChallengeId, now: number): Promise<BeginSubmitResult>;
  markSubmitted(id: ChallengeId, attempt: number, txHash: string): Promise<MarkResult>;
  markConfirmed(id: ChallengeId, attempt: number, txHash: string | null): Promise<ConfirmedResult>;
  markFailed(id: ChallengeId, attempt: number, reason: string): Promise<MarkResult>;
  getStatus(id: ChallengeId): Promise<ChallengeStatus>;
}

const withId = (challengeId: ChallengeId, view: LedgerSnapshot): ChallengeStatus => ({ challengeId, ...view });

/** One ledger per challenge, in the isolate's memory. Not durable: dev and tests only. */
export class InMemoryConsensusGateway implements ConsensusGateway {
  private readonly ledgers = new Map<ChallengeId, ConsensusLedger>();

  constructor(private readonly clock: () => number = Date.now) {}

  private ledger(id: ChallengeId): ConsensusLedger {
    let ledger = this.ledgers.get(id);
    if (!ledger) {
      ledger = new ConsensusLedger(new InMemoryLedgerStorage(), this.clock);
      this.ledgers.set(id, ledger);
    }
    return ledger;
  }

  vote(id: ChallengeId, wallet: WalletAddress, winner: WalletAddress, threshold: number): Promise<VoteResult> {
    return this.ledger(id).vote(wallet, winner, threshold);
  }

  beginSubmit(id: ChallengeId, now: number): Promise<BeginSubmitResult> {
    return this.ledger(id).beginSubmit(now);
  }

  markSubmitted(id: ChallengeId, attempt: number, txHash: string): Promise<MarkResult> {
    return this.ledger(id).markSubmitted(attempt, txHash);
  }

  markConfirmed(id: ChallengeId, attempt: number, txHash: string | null): Promise<ConfirmedResult> {
    return this.ledger(id).markConfirmed(attempt, txHash);
  }

  markFailed(id: ChallengeId, attempt: number, reason: string): Promise<MarkResult> {
    return this.ledger(id).markFailed(attempt, reason);
  }

  async getStatus(id: ChallengeId): Promise<ChallengeStatus> {
    return withId(id, await this.ledger(id).snapshot());
  }
}

/**
 * Structural subset of `DurableObjectNamespace` used by the gateways. The real namespace
 * satisfies it; tests route `idFromName` to fake shell instances.
 */
export interface DurableStubLike {
  fetch(input: string, init?: RequestInit): Promise<Response>;
}

export interface DurableNamespaceLike {
  idFromName(name: string): unknown;
  get(id: unknown): DurableStubLike;
}

const INTERNAL_URL = "https://durable.internal/";

async function callShell<T>(namespace: DurableNamespaceLike, name: string, body: unknown): Promise<T> {
  const stub = namespace.get(namespace.idFromName(name));
  const response = await stub.fetch(INTERNAL_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(`consensus: the Durable Object answered ${response.status}`);
  }
  return (await response.json()) as T;
}

/** One `ConfirmationStore` Durable Object per challenge id. */
export class DurableConsensusGateway implements ConsensusGateway {
  constructor(private readonly namespace: DurableNamespaceLike) {}

  private send<T>(id: ChallengeId, command: LedgerCommand): Promise<T> {
    return callShell<T>(this.namespace, id, command);
  }

  vote(id: ChallengeId, wallet: WalletAddress, winner: WalletAddress, threshold: number): Promise<VoteResult> {
    return this.send(id, { op: "vote", wallet, winner, threshold });
  }

  beginSubmit(id: ChallengeId, now: number): Promise<BeginSubmitResult> {
    return this.send(id, { op: "beginSubmit", now });
  }

  markSubmitted(id: ChallengeId, attempt: number, txHash: string): Promise<MarkResult> {
    return this.send(id, { op: "markSubmitted", attempt, txHash });
  }

  markConfirmed(id: ChallengeId, attempt: number, txHash: string | null): Promise<ConfirmedResult> {
    return this.send(id, { op: "markConfirmed", attempt, txHash });
  }

  markFailed(id: ChallengeId, attempt: number, reason: string): Promise<MarkResult> {
    return this.send(id, { op: "markFailed", attempt, reason });
  }

  async getStatus(id: ChallengeId): Promise<ChallengeStatus> {
    return withId(id, await this.send<LedgerSnapshot>(id, { op: "getStatus" }));
  }
}

/** One `UpdateDedupe` Durable Object per chat. */
export class DurableUpdateDedupe implements UpdateDedupeGateway {
  constructor(private readonly namespace: DurableNamespaceLike) {}

  async markIfNew(chatKey: string, updateId: number): Promise<boolean> {
    const answer = await callShell<{ isNew: boolean }>(this.namespace, chatKey, { op: "markIfNew", updateId });
    return answer.isNew;
  }
}
