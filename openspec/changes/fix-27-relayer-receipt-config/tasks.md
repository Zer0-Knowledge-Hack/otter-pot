# Tasks: Relayer receipt confirmation and single chain config (#27)

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~1100-1300 (about 550 are deletions of dead code) |
| 400-line budget risk | High |
| Chained PRs recommended | Yes (technically); user chose one PR |
| Suggested split | Single PR, 4 independently reviewable commits |
| Delivery strategy | single-pr |
| Chain strategy | size-exception |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: size-exception
400-line budget risk: High

Forecast exceeds 400 lines mainly from deleting `orchestrator.ts`, its test and writer code (pure deletions). Single PR requires `size:exception` approval before apply.

### Suggested Work Units (commits in one PR)

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|------|------|-----------|----------------------|-----------------|-------------------|
| 1 | Delete dead orchestrator path | PR 1 commit 1 | `yarn worker:test` | N/A: deletion only | Revert commit 1 |
| 2 | Config + URL validation | PR 1 commit 2 | `yarn worker:test` | N/A: unit scans | Revert commit 2 |
| 3 | Errors, queue, receipt flow, state | PR 1 commit 3 | `yarn worker:test` | Manual Sepolia (task 3.15) | Revert commit 3 |
| 4 | Docs | PR 1 commit 4 | N/A | N/A: docs | Revert commit 4 |

All paths below are relative to `packages/worker/` unless prefixed `docs/`. After each commit run `yarn worker:test`, `yarn worker:lint`, `yarn worker:check-types`.

## Commit 1: `chore(worker)` deletions

- [x] 1.1 Delete `src/orchestrator.ts` and `test/orchestrator.test.ts`.
- [x] 1.2 In `src/confirmTx.ts` remove `createOperatorWriter*`, `OperatorWriterConfig`, `OperatorEnv`, duplicate key regex, related comments; keep `buildConfirmResultCall`, `buildAndSendConfirmResult`.
- [x] 1.3 In `test/confirmTx.test.ts` remove L258-286 (writer tests); winner-guard tests must pass.
- [x] 1.4 In `src/index.ts` remove `Env.ARBITRUM_RPC_URL`.

## Commit 2: `fix(worker)` config + URL validation

- [x] 2.1 RED: in `test/chain.test.ts` add `configDesdeEnv` tests: invalid/`ftp://` URL, per-variable missing/invalid messages, key never echoed, valid config.
- [x] 2.2 GREEN: in `src/telegram/chain.ts` add `CHAIN_RPC_URL` http/https validation.
- [x] 2.3 Static test: `wrangler.toml` has no `0x[0-9a-fA-F]{40}`, `CHAIN_ID = "421614"`, no `5042002`; no `ARBITRUM_RPC_URL` or `orchestrator` refs in `packages/worker`.
- [x] 2.4 `wrangler.toml`: `[vars]` with `ENVIRONMENT`, `CHAIN_ID = "421614"`, `keep_vars = true`; comments for `wrangler secret put` (key, RPC); remove addresses.
- [x] 2.5 `.dev.vars.example`: 421614, Sepolia RPC, `0x<pool-address>` placeholders.

## Commit 3: `fix(worker)` errors, queue, receipt flow, state

- [x] 3.1 RED `test/errores.test.ts`: Stylus codes (text and raw ASCII revert bytes e.g. `0x6e6f5f6f70`), typed error messages, unknown fallback. Do NOT map #19-only codes (`ratemax`, `recipient0`, `bad_status`, `norecover`, `payfee`).
- [x] 3.2 GREEN `src/telegram/errores.ts`: `TransaccionRevertidaError`, `RetoNoResueltoError`, `EnvioFallidoError`; full alias table from design (incl. `notopen`, `notlocked`, `deposited`, `incdep`, `winzero`, `winpart`, `nodln`, `vred/vdep/appr`, `inited`, `vault0`); `nopart` single neutral message; UTF-8 decode of short printable revert data.
- [x] 3.3 Spec adjustment: edit `specs/relayer-transaction-confirmation/spec.md` scenario "Stylus short code" so `nopart` returns the neutral message instead of the Solidity-identical one; extend code list per design.
- [x] 3.4 RED `test/chain.test.ts`: `ColaDeTransacciones` ordering and failure isolation.
- [x] 3.5 GREEN: add queue in `src/telegram/chain.ts` (`tail.then(task)`; tail never rejects); module-level `Map<operatorAddress, cola>`, injectable via `crearChainClient(config, { cola })`.
- [x] 3.6 RED `test/chain.test.ts` with fake `PuertoDeCadena`: `confirmarResultado` success / reverted / not-Resolved / send error; second send only after first receipt (distinct nonces); `crearReto` and `reembolsar` reverted.
- [x] 3.7 GREEN `src/telegram/chain.ts`: `PuertoDeCadena` port (`enviar`, `esperarRecibo` timeout 60_000, `leerEstado`, `leerDecimales`, `idDeRetoCreado`), viem adapter, `confirmarResultado`, receipt checks for all writes, drop `ChainClient.writer`.
- [x] 3.8 RED `test/confirmations.test.ts`: `marcarEnviada/Confirmada/Fallida`, lock release, retry after `fallida`, no duplicate on `enviada`/`confirmada`, `getChallengeStatus` exposes `resolutionStatus`.
- [x] 3.9 GREEN `src/confirmations.ts`: optional `resolutionStatus`, `resolutionTxHash`, helpers.
- [x] 3.10 RED `test/retos.test.ts` (`CadenaFalsa` gains `confirmarResultado`): announce/history only on success; reverted and not-Resolved messages; retry hint.
- [x] 3.11 GREEN `src/telegram/retos.ts` `handleConfirmar`: guard writer adapter, `marcarConfirmada`, catch -> `marcarFallida` + `describirErrorDeContrato`; status-aware `alreadyTriggered`.
- [x] 3.12 Run `yarn worker:test`, `yarn worker:lint`, `yarn worker:check-types`; re-run static scans.

## Commit 4: `docs`

- [x] 4.1 `docs/SDD.md` 9.2 (Spanish): in-memory store, isolate-scoped queue, DD-07 pending, states, receipt timeout; section 11: key and RPC are secrets, no write path bypasses winner guard.
- [x] 4.2 `docs/TESTING.md` section 4: rename states to `enviada/confirmada/fallida`; cross-isolate nonces best effort; `wrangler secret put` for key and RPC.

## Manual verification

- [ ] 5.1 Manual, not automatable: one real challenge resolution on Arbitrum Sepolia (secrets set, `wrangler dev`/deploy); confirm receipt verified, `confirmada`, announcement.
