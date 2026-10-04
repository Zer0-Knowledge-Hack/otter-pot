/**
 * Pure transition core of the per-challenge consensus ledger (#26, DD-07).
 *
 * Every function takes the current `LedgerState` and returns the next state plus a
 * typed result. Nothing here touches storage, the clock or the network: `now` is always
 * injected, so each transition is deterministic and testable without fakes. The serial
 * runner that persists these transitions lives in `./ledger.ts`.
 *
 * Phases: collecting -> consensus -> submitting -> submitted -> confirmed | failed,
 * with `failed` (or an expired `submitting`/`submitted`) re-entering `submitting`.
 */

export type WalletAddress = string;
export type ChallengeId = string;

export type Phase = "collecting" | "consensus" | "submitting" | "submitted" | "confirmed" | "failed";

/** The lease must outlive a holder's legitimate work: broadcast (~60 s with retries) plus receipt wait. */
export const LEASE_MS = 180_000;
/** Maximum wait for a receipt before the holder records a failure. */
export const RECEIPT_TIMEOUT_MS = 90_000;

/** Reason recorded when a lease expires without an outcome. */
export const LEASE_EXPIRED = "lease_expired";

export interface LedgerState {
  phase: Phase;
  /** voter wallet -> proposed winner. One current vote per wallet. */
  votes: Record<WalletAddress, WalletAddress>;
  /** Fixed by the first vote of the challenge; never changes afterwards. `null` before any vote. */
  threshold: number | null;
  /** Winner of the consensus, `null` while collecting. */
  winner: WalletAddress | null;
  /** Monotonic submit-attempt counter, used to fence stale holders. */
  attempt: number;
  /** Epoch ms until which the current `submitting`/`submitted` holder owns the lease. */
  leaseUntil: number | null;
  txHash: string | null;
  failureReason: string | null;
}

export type VoteResult =
  | { kind: "recorded"; consensusTriggered: false }
  | { kind: "recorded"; consensusTriggered: true; winner: WalletAddress }
  | { kind: "frozen"; phase: Phase; winner?: WalletAddress }
  | { kind: "invalid_wallet" };

export type BeginSubmitResult =
  | { granted: true; attempt: number; winner: WalletAddress }
  | { granted: false; phase: Phase };

export type MarkResult =
  | { ok: true; phase: Phase }
  | { ok: false; reason: "stale_attempt" | "invalid_phase"; phase: Phase };

export type ConfirmedResult = MarkResult & { firstConfirmation: boolean };

export interface Transition<R> {
  state: LedgerState;
  result: R;
}

/** Payload exposed to the bot and the status endpoint. */
export interface ChallengeStatus {
  challengeId: ChallengeId;
  confirmationsCount: number;
  /** `null` until the first vote fixes it. */
  threshold: number | null;
  /** True once the phase left `collecting`. */
  consensusReached: boolean;
  winner?: WalletAddress;
  phase: Phase;
  /** Present when `submitted` or `confirmed` with a broadcast tx. */
  txHash?: string;
  /** Present when `failed`. */
  failureReason?: string;
  attempt: number;
}

export type LedgerSnapshot = Omit<ChallengeStatus, "challengeId">;

export function emptyLedger(): LedgerState {
  return {
    phase: "collecting",
    votes: {},
    threshold: null,
    winner: null,
    attempt: 0,
    leaseUntil: null,
    txHash: null,
    failureReason: null,
  };
}

/** Candidate that reached `threshold` votes, if any. */
function findWinner(votes: Record<WalletAddress, WalletAddress>, threshold: number): WalletAddress | null {
  const counts = new Map<WalletAddress, number>();
  for (const candidate of Object.values(votes)) {
    counts.set(candidate, (counts.get(candidate) ?? 0) + 1);
  }
  for (const [candidate, count] of counts) {
    if (count >= threshold) return candidate;
  }
  return null;
}

export function vote(
  state: LedgerState,
  wallet: WalletAddress,
  proposedWinner: WalletAddress,
  threshold: number,
): Transition<VoteResult> {
  // Never infer or assume a wallet (W2.2 guard): no verifiable wallet, no vote.
  if (!wallet || wallet.trim() === "") {
    return { state, result: { kind: "invalid_wallet" } };
  }

  if (state.phase !== "collecting") {
    return {
      state,
      result: { kind: "frozen", phase: state.phase, ...(state.winner ? { winner: state.winner } : {}) },
    };
  }

  // The threshold is fixed by the first vote so it cannot float mid-challenge.
  const fixedThreshold = state.threshold ?? threshold;
  const votes = { ...state.votes, [wallet]: proposedWinner };
  const winner = findWinner(votes, fixedThreshold);

  if (winner === null) {
    return {
      state: { ...state, votes, threshold: fixedThreshold },
      result: { kind: "recorded", consensusTriggered: false },
    };
  }

  return {
    state: { ...state, votes, threshold: fixedThreshold, phase: "consensus", winner },
    result: { kind: "recorded", consensusTriggered: true, winner },
  };
}

function leaseExpired(state: LedgerState, now: number): boolean {
  return state.leaseUntil !== null && now >= state.leaseUntil;
}

export function beginSubmit(state: LedgerState, now: number): Transition<BeginSubmitResult> {
  const inFlight = state.phase === "submitting" || state.phase === "submitted";

  // An expired in-flight phase is `failed("lease_expired")`: the holder crashed or stalled.
  const effective: LedgerState =
    inFlight && leaseExpired(state, now)
      ? { ...state, phase: "failed", failureReason: LEASE_EXPIRED, leaseUntil: null }
      : state;

  const canSubmit = effective.phase === "consensus" || effective.phase === "failed";
  if (!canSubmit || effective.winner === null) {
    return { state, result: { granted: false, phase: state.phase } };
  }

  const attempt = effective.attempt + 1;
  return {
    state: {
      ...effective,
      phase: "submitting",
      attempt,
      leaseUntil: now + LEASE_MS,
      txHash: null,
      failureReason: null,
    },
    result: { granted: true, attempt, winner: effective.winner },
  };
}

/** Rejects marks from a superseded attempt, or from a phase that cannot take them. */
function fence(state: LedgerState, attempt: number, allowed: readonly Phase[]): Transition<MarkResult> | null {
  if (attempt !== state.attempt) {
    return { state, result: { ok: false, reason: "stale_attempt", phase: state.phase } };
  }
  if (!allowed.includes(state.phase)) {
    return { state, result: { ok: false, reason: "invalid_phase", phase: state.phase } };
  }
  return null;
}

export function markSubmitted(
  state: LedgerState,
  attempt: number,
  txHash: string,
  now: number,
): Transition<MarkResult> {
  const rejected = fence(state, attempt, ["submitting"]);
  if (rejected) return rejected;
  return {
    state: { ...state, phase: "submitted", txHash, leaseUntil: now + LEASE_MS },
    result: { ok: true, phase: "submitted" },
  };
}

export function markConfirmed(
  state: LedgerState,
  attempt: number,
  txHash: string | null,
): Transition<ConfirmedResult> {
  // Re-confirming an already confirmed attempt is idempotent and never a "first" confirmation.
  if (state.phase === "confirmed" && attempt === state.attempt) {
    return { state, result: { ok: true, phase: "confirmed", firstConfirmation: false } };
  }
  const rejected = fence(state, attempt, ["submitting", "submitted"]);
  if (rejected) return { state: rejected.state, result: { ...rejected.result, firstConfirmation: false } };
  return {
    state: {
      ...state,
      phase: "confirmed",
      txHash: txHash ?? state.txHash,
      leaseUntil: null,
      failureReason: null,
    },
    result: { ok: true, phase: "confirmed", firstConfirmation: true },
  };
}

export function markFailed(state: LedgerState, attempt: number, reason: string): Transition<MarkResult> {
  const rejected = fence(state, attempt, ["submitting", "submitted"]);
  if (rejected) return rejected;
  return {
    state: { ...state, phase: "failed", failureReason: reason, leaseUntil: null },
    result: { ok: true, phase: "failed" },
  };
}

export function snapshot(state: LedgerState): LedgerSnapshot {
  const view: LedgerSnapshot = {
    confirmationsCount: Object.keys(state.votes).length,
    threshold: state.threshold,
    consensusReached: state.phase !== "collecting",
    phase: state.phase,
    attempt: state.attempt,
  };
  if (state.winner !== null) view.winner = state.winner;
  if (state.txHash !== null) view.txHash = state.txHash;
  if (state.phase === "failed" && state.failureReason !== null) view.failureReason = state.failureReason;
  return view;
}
