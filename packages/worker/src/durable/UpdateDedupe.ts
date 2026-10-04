/**
 * Durable Object shell hosting one chat's `update_id` dedupe log (#26).
 *
 * One instance per chat. Speaks `{ op: "markIfNew", updateId }` over `fetch` and answers
 * `{ isNew }`. Like `ConfirmationStore`, it does not import `cloudflare:workers`.
 */

import type { DedupeState } from "../consensus/dedupe";
import { UpdateDedupeLog } from "../consensus/dedupe";
import { readJsonBody } from "./state";
import type { DurableStateLike } from "./state";

const DEDUPE_KEY = "dedupe";

export class UpdateDedupe {
  private readonly log: UpdateDedupeLog;

  constructor(state: DurableStateLike) {
    this.log = new UpdateDedupeLog({
      get: () => state.storage.get<DedupeState>(DEDUPE_KEY),
      put: (next) => state.storage.put(DEDUPE_KEY, next),
    });
  }

  async fetch(request: Request): Promise<Response> {
    if (request.method !== "POST") {
      return new Response("Method Not Allowed", { status: 405 });
    }
    const body = await readJsonBody(request);
    const valid =
      typeof body === "object" &&
      body !== null &&
      (body as Record<string, unknown>)["op"] === "markIfNew" &&
      typeof (body as Record<string, unknown>)["updateId"] === "number";
    if (!valid) {
      return new Response("Bad Request: unknown or malformed command", { status: 400 });
    }
    const updateId = (body as { updateId: number }).updateId;
    return Response.json({ isNew: await this.log.markIfNew(updateId) });
  }
}
