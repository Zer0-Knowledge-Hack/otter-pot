# Exploration: worker-persistent-consensus (issue #26)

Full report: engram `sdd/worker-persistent-consensus/explore` (id 382).

## Current State
- Votes live in a module-level `InMemoryConfirmationStore` in `packages/worker/src/index.ts` (isolate-local, lost on restart).
- `registerConfirmation` does read-compute-put: lost-update race.
- `consensusTriggeredFor` is latched BEFORE any tx is sent, so a failed tx can never be retried.
- Live send path: `telegram/retos.ts#handleConfirmar`; `orchestrator.ts#processConfirmation` is unwired.
- `confirmTx.ts#buildConfirmResultCall` guard (consensusReached + winner match) must be preserved.
- Confirm writer in `telegram/chain.ts` does not wait for a receipt (DD-08 / #27 boundary).
- `update_id` is declared but never read: the webhook does not dedupe. Must be implemented.
- `wrangler.toml` has no Durable Object binding or migration.
- Tests run on plain vitest (no workers pool).

## Approaches
1. Durable Object per challenge + pure state-machine core (recommended). DO exposes atomic commands: vote, beginSubmit (CAS from consensus|failed to submitting, with lease), markSubmitted(txHash), markConfirmed, markFailed(reason), getStatus. Chain call stays outside the DO.
2. DO owns the whole send via alarms (rejected: operator key in DO, overlaps DD-08).
3. KV versioned writes (rejected by DD-07: eventual consistency).
4. D1/SQL (rejected: new infra, no benefit).

update_id dedupe: (a) singleton DO, (b) KV put with TTL (racy), (c) per-chat DO (recommended).

## Risks
- DO shell untestable in plain vitest.
- Crash window between broadcast and markSubmitted can duplicate a send.
- Receipt wait may creep into #27.
- History is currently recorded before the tx is mined.
- DO migration tags are immutable once deployed.
- Issue naming (voting/sent) differs from DD-07 (collecting/submitted); DD-07 is the doc of record.

## Open Product Decisions
1. Retry UX and who may retry.
2. Votes after consensus.
3. Is `confirmed` (receipt wait) in scope or deferred to #27.
4. Max retries / backoff / lease timeout; manual vs alarm retry.
5. update_id storage and retention.
6. Retire or align `orchestrator.ts`.
7. Status payload fields.
8. State naming.
