# Tasks: Persistent Atomic Consensus with Tx Lifecycle (#26)

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 1500-2200 (incl. tests, deletions of orchestrator) |
| 400-line budget risk | High |
| Chained PRs recommended | No (user mandated single PR; commits per work unit) |
| Suggested split | Single PR, one commit per work unit |
| Delivery strategy | single-pr |
| Chain strategy | n/a |

Decision needed before apply: Yes
Chained PRs recommended: No
Chain strategy: pending
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|------|------|-----------|----------------------|-----------------|-------------------|
| A (1-3) | Core, ledger, dedupe, DO shells | PR 1 | `npx vitest run test/consensus` | N/A: pure logic, fake storage | `src/consensus`, `src/durable` |
| B (4-6) | Gateway, resolucion, router/commands | PR 1 | `npx vitest run test/telegram` | fake ChainClient integration | `src/telegram`, `src/confirmations.ts` |
| C (7-9) | status/confirmTx, dedupe wiring, config, cleanup | PR 1 | `npm test` | `wrangler dev` + `deploy --dry-run` | `wrangler.toml`, `src/index.ts` |
| D (10-11) | Docs, final gate | PR 1 | `npm run lint && npm test` | N/A | `docs/` |

Paths are under `packages/worker/`. Each task: RED test, then GREEN, then refactor.

## Phase 0: Tooling

- [x] 0.1 Verify wrangler `^3.78` accepts `new_sqlite_classes` with a fetch-based DO (`wrangler deploy --dry-run` on a scratch config); bump `wrangler` in `package.json` if not.

## Phase 1: Core and ledger

- [x] 1.1 RED `test/consensus/core.test.ts`: vote/freeze/consensus trigger once, fixed threshold, fencing `stale_attempt`, lease expiry of `submitting` and `submitted` => `failed("lease_expired")`, attempt monotonic.
- [x] 1.2 GREEN `src/consensus/core.ts` pure transitions and types (`Phase`, results).
- [x] 1.3 RED `test/consensus/ledger.test.ts`: 5 concurrent votes, double `beginSubmit`, persistence via second ledger on same fake storage.
- [x] 1.4 GREEN `src/consensus/ledger.ts` promise-chain serial runner over one-key `LedgerStorage`.
- [x] 1.5 RED `test/consensus/dedupe.test.ts`: redelivery, per-chat, FIFO eviction at 200.
- [x] 1.6 GREEN `src/consensus/dedupe.ts`.

## Phase 2: DO shells

- [x] 2.1 RED `test/durable/shells.test.ts`: command `Request`s against fake `state.storage` for both shells.
- [x] 2.2 GREEN `src/durable/ConfirmationStore.ts`, `src/durable/UpdateDedupe.ts` (no `cloudflare:workers` import).

## Phase 3: Gateway

- [x] 3.1 RED `test/consensus/gateway.test.ts`: in-memory and DO gateways satisfy the same `ConsensusGateway` contract.
- [x] 3.2 GREEN `src/consensus/gateway.ts`; update `src/confirmations.ts` (re-export types, drop `registerConfirmation` and in-memory store).

## Phase 4: Chain, resolucion, handlers

- [x] 4.1 RED `test/telegram/resolucion.test.ts`: confirm, receipt revert, already settled (status 2), refunded (3), history once, stale lease recovery.
- [x] 4.2 GREEN `src/telegram/chain.ts` (`esperarRecibo`), `src/telegram/resolucion.ts` (`resolverEnCadena`); adapt `buildConfirmResultCall` to `{getStatus}`.
- [x] 4.3 RED+GREEN `src/telegram/retos.ts`: `/confirmar` lifecycle replies, "en curso", `/reintentar` participant-only (non-participant rejected).

## Phase 5: Router and commands

- [x] 5.1 RED+GREEN `src/telegram/router.ts`, `comandos.ts`: `/reintentar <id>` routing, menu, help.

## Phase 6: Status and confirmTx

- [x] 6.1 RED+GREEN `src/status.ts`, `src/confirmTx.ts`: gateway reader; payload `phase`, `txHash`, `failureReason`.

## Phase 7: update_id dedupe

- [x] 7.1 RED+GREEN `src/telegram.ts`: dedupe before `handleUpdate`; key `chat.id ?? callback chat ?? "nochat"`; fail open with `console.warn`.

## Phase 8: Config

- [x] 8.1 `wrangler.toml`: two DO bindings, migration `v1` `new_sqlite_classes`; `src/index.ts`: `Env` optional namespaces, export classes, gateway resolution with in-memory fallback.

## Phase 9: Cleanup

- [x] 9.1 Delete `src/orchestrator.ts` and `test/orchestrator.test.ts`; fix imports.

## Phase 10: Docs

- [x] 10.1 `docs/SDD.md` §9 (DO model, lifecycle, dedupe, `/reintentar`) and `docs/DESIGN_DECISIONS.md` DD-07 (`submitting` lease).

## Phase 11: Final gate

- [x] 11.1 Run `npm run lint` and `npm test` in `packages/worker`; `wrangler deploy --dry-run`; fix failures.
