/**
 * Typed JSON command union spoken between the DO gateway and the Durable Object shell.
 *
 * The shell never exposes anything beyond these commands, and none of them can name a
 * payout address: the winner only ever comes from the votes the ledger recorded.
 */

import type { ConsensusLedger } from "./ledger";

export type LedgerCommand =
  | { op: "vote"; wallet: string; winner: string; threshold: number }
  | { op: "beginSubmit"; now: number }
  | { op: "markSubmitted"; attempt: number; txHash: string }
  | { op: "markConfirmed"; attempt: number; txHash: string | null }
  | { op: "markFailed"; attempt: number; reason: string }
  | { op: "getStatus" };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const isString = (value: unknown): value is string => typeof value === "string";
const isNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

/** Validates an untrusted JSON body into a command, or `null` when it is not one. */
export function parseLedgerCommand(body: unknown): LedgerCommand | null {
  if (!isRecord(body)) return null;

  switch (body["op"]) {
    case "vote": {
      const { wallet, winner, threshold } = body;
      return isString(wallet) && isString(winner) && isNumber(threshold)
        ? { op: "vote", wallet, winner, threshold }
        : null;
    }
    case "beginSubmit":
      return isNumber(body["now"]) ? { op: "beginSubmit", now: body["now"] } : null;
    case "markSubmitted": {
      const { attempt, txHash } = body;
      return isNumber(attempt) && isString(txHash) ? { op: "markSubmitted", attempt, txHash } : null;
    }
    case "markConfirmed": {
      const { attempt, txHash } = body;
      return isNumber(attempt) && (txHash === null || isString(txHash))
        ? { op: "markConfirmed", attempt, txHash }
        : null;
    }
    case "markFailed": {
      const { attempt, reason } = body;
      return isNumber(attempt) && isString(reason) ? { op: "markFailed", attempt, reason } : null;
    }
    case "getStatus":
      return { op: "getStatus" };
    default:
      return null;
  }
}

export function runLedgerCommand(ledger: ConsensusLedger, command: LedgerCommand): Promise<unknown> {
  switch (command.op) {
    case "vote":
      return ledger.vote(command.wallet, command.winner, command.threshold);
    case "beginSubmit":
      return ledger.beginSubmit(command.now);
    case "markSubmitted":
      return ledger.markSubmitted(command.attempt, command.txHash);
    case "markConfirmed":
      return ledger.markConfirmed(command.attempt, command.txHash);
    case "markFailed":
      return ledger.markFailed(command.attempt, command.reason);
    case "getStatus":
      return ledger.snapshot();
  }
}
