/**
 * Durable Object shell hosting one challenge's consensus ledger (#26).
 *
 * One instance per challenge id. All logic lives in `ConsensusLedger`; this class only
 * adapts `state.storage` to the ledger's single-key storage and speaks the typed JSON
 * command union over `fetch`. It does not import `cloudflare:workers`.
 */

import { parseLedgerCommand, runLedgerCommand } from "../consensus/commands";
import type { LedgerState } from "../consensus/core";
import { ConsensusLedger } from "../consensus/ledger";
import { readJsonBody } from "./state";
import type { DurableStateLike } from "./state";

const LEDGER_KEY = "ledger";

export class ConfirmationStore {
  private readonly ledger: ConsensusLedger;

  constructor(state: DurableStateLike) {
    this.ledger = new ConsensusLedger({
      get: () => state.storage.get<LedgerState>(LEDGER_KEY),
      put: (next) => state.storage.put(LEDGER_KEY, next),
    });
  }

  async fetch(request: Request): Promise<Response> {
    if (request.method !== "POST") {
      return new Response("Method Not Allowed", { status: 405 });
    }
    const command = parseLedgerCommand(await readJsonBody(request));
    if (!command) {
      return new Response("Bad Request: unknown or malformed command", { status: 400 });
    }
    return Response.json(await runLedgerCommand(this.ledger, command));
  }
}
