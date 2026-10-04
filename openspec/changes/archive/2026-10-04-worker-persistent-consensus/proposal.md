# Proposal: Persistent Atomic Consensus with Tx Lifecycle (issue #26)

## Intent

Votes live in an isolate-local in-memory store with a read-compute-put race, and consensus is latched before any tx is sent, so a failed `confirmResult` can never be retried. Telegram redeliveries are not deduplicated. Success: votes are durable and atomic, at most one tx is in flight, failures are retryable, and duplicate updates are ignored.

## Scope

### In Scope
- `ConfirmationStore` Durable Object per challenge (binding + `new_sqlite_classes` migration in `wrangler.toml`).
- Pure state-machine core (DD-07): `collecting -> consensus -> submitting(lease) -> submitted(txHash) -> confirmed | failed(reason) -> retry`.
- Votes frozen after consensus; `submitting` lease with timeout; manual retry only.
- Retry via new `/reintentar <id>` and repeated `/confirmar` when `failed`; any challenge participant.
- Check on-chain `challengeStatus` before resend; minimal receipt wait for `submitted -> confirmed|failed`.
- History recorded only after `confirmed`; status payload exposes `phase`, `txHash`, `failureReason`.
- `update_id` dedupe: per-chat DO, bounded retention, marked at processing start.
- Preserve `buildConfirmResultCall` guard; update `docs/SDD.md`.
- Retire `orchestrator.ts` (unwired duplicate of `handleConfirmar`; one send path removes divergence and test churn).

### Out of Scope
- Nonce management / tx serialization (#27, DD-08).
- Alarm-driven auto-retry, backoff policies.
- `@cloudflare/vitest-pool-workers` adoption.

## Capabilities

### New Capabilities
- `worker-consensus-lifecycle`: durable atomic voting, consensus, tx lifecycle, retry, status payload.
- `telegram-update-dedupe`: webhook `update_id` idempotency.

### Modified Capabilities
- None

## Approach

Approach 1 from exploration: thin DO shell delegating to a pure, storage-agnostic state machine (unit-tested in plain vitest with fake storage). Atomic commands: `vote`, `beginSubmit` (CAS `consensus|failed -> submitting`), `markSubmitted`, `markConfirmed`, `markFailed`, `getStatus`. The chain call stays in the Worker, outside the DO. Strict TDD: core RED tests first, then DO shell, then wiring.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `packages/worker/src/confirmations.ts` | Modified | State machine + store interface |
| `packages/worker/src/index.ts` | Modified | Export DO classes, per-challenge stubs |
| `packages/worker/wrangler.toml` | Modified | DO bindings + migration |
| `packages/worker/src/telegram/retos.ts`, `router.ts`, `comandos.ts` | Modified | `/confirmar` flow, `/reintentar` |
| `packages/worker/src/telegram.ts` | Modified | `update_id` dedupe |
| `packages/worker/src/telegram/chain.ts` | Modified | Receipt wait for confirm |
| `packages/worker/src/status.ts`, `confirmTx.ts` | Modified | Status fields, guard on new store |
| `packages/worker/src/orchestrator.ts` (+ test) | Removed | Unwired duplicate |
| `docs/SDD.md` | Modified | Lifecycle + DO model |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Crash between broadcast and `markSubmitted` duplicates send | Low | Lease + on-chain status check; contract reverts double confirm |
| DO shell untested in plain vitest | Med | Keep shell trivial; logic in pure core |
| Receipt wait creeps into #27 | Med | Receipt only drives state; no nonce logic |
| Immutable migration tags | Low | Single reviewed tag `v1` |
| Test churn across ~7 files | Med | In-memory impl of new interface |

## Rollback Plan

Revert the PR; the DO migration is additive, so redeploying the prior Worker restores the in-memory store (DO data abandoned, no on-chain impact).

## Dependencies

- Durable Objects on the Cloudflare account; #27 for nonce safety.

## Success Criteria

- [ ] 5 concurrent votes -> 5 votes, one consensus trigger.
- [ ] State persists across store instances.
- [ ] Retry `failed -> submitted` once `-> confirmed`.
- [ ] Double `/confirmar` sends one tx.
- [ ] Repeated `update_id` ignored.
- [ ] `npm test` and `npm run lint` pass.
