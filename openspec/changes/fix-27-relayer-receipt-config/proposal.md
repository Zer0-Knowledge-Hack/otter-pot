# Proposal: Relayer receipt confirmation and single chain config (issue #27)

## Intent

The worker announces a challenge as resolved on broadcast, not on mining. Reverted txs look successful, `consensusTriggeredFor` blocks retries forever, concurrent sends can collide on nonces, and two config paths (`CHAIN_*` vs `ARBITRUM_RPC_URL`) coexist. Basis: DD-08, `docs/TESTING.md` section 4, SDD sections 9.2 and 11.

## Scope

### In Scope
- `ChainClient.confirmarResultado(challengeId, winner)`: send, wait receipt, require `status === "success"`, re-read `challengeStatus === 2`; typed errors.
- One in-process promise queue serializing `confirmarResultado`, `crearReto`, `reembolsar`; all check `receipt.status`.
- `handleConfirmar` uses it; `ConfirmationStore` gets `enviada`/`confirmada`/`fallida`; failure releases `consensusTriggeredFor`; announce/history only on `confirmada`.
- Delete `src/orchestrator.ts`, `test/orchestrator.test.ts`, the `ARBITRUM_RPC_URL` path (`createOperatorWriter*`, `OperatorEnv`, `Env.ARBITRUM_RPC_URL`, comments, W3.1 tests). Keep `buildConfirmResultCall`/`buildAndSendConfirmResult`.
- `errores.ts`: Stylus short-code aliases + reverted-receipt / not-Resolved messages.
- `configDesdeEnv`: RPC URL validation, per-variable messages.
- `wrangler.toml`: no 40-hex addresses, `CHAIN_ID=421614`; `.dev.vars.example` 421614 placeholders; key/RPC via `wrangler secret put`.
- Update `docs/SDD.md` (9.2, 11) and `docs/TESTING.md` (section 4).

### Out of Scope
- Durable Object queue/nonce (approach C) and DD-07 lifecycle.
- Changing any deployed contract address.
- Contract changes.

## Capabilities

### New Capabilities
- `relayer-transaction-confirmation`: serialized send, receipt/status verification, confirmation state lifecycle, revert messages.
- `worker-chain-config`: single env-driven chain config, validation, no addresses in `wrangler.toml`.

### Modified Capabilities
- None

## Approach

Approach A (confirmed). Queue lives inside `crearChainClient`; tests use `CadenaFalsa` and a fake public/wallet client. Cross-isolate serialization is best effort and documented. Strict TDD via `yarn worker:test`.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `packages/worker/src/telegram/chain.ts` | Modified | Queue, `confirmarResultado`, receipt checks, URL validation |
| `packages/worker/src/telegram/retos.ts` | Modified | `handleConfirmar` flow |
| `packages/worker/src/confirmations.ts` | Modified | Status + release on failure |
| `packages/worker/src/telegram/errores.ts` | Modified | Aliases, messages |
| `packages/worker/src/confirmTx.ts`, `src/index.ts` | Modified | Remove parallel path |
| `packages/worker/src/orchestrator.ts` + test | Removed | Dead code |
| `packages/worker/wrangler.toml`, `.dev.vars.example` | Modified | Config |
| `docs/SDD.md`, `docs/TESTING.md` | Modified | Docs |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Cross-isolate nonce collision | Med | Document best effort; DD-07/DO later |
| Missing vars make bot run "without chain" | Med | Per-variable errors, docs |
| Sepolia addresses stale | Med | Placeholders only; team coordinates |
| Diff exceeds 400-line budget (~550 deletions of dead code + ~500 additions) | High | Separate commits: deletions, config, receipt flow; review deletions as low-risk |

## Rollback Plan

Revert the PR (or individual commits). No contract or storage migration; restore `wrangler.toml` vars to redeploy prior config.

## Dependencies

- #26 (Arc port) partially present on branch; Arbitrum Sepolia RPC/key as secrets for manual check.

## Success Criteria

- [ ] Reverted receipt or non-Resolved status yields `fallida`, user-facing message, and retry allowed.
- [ ] Success announced only after mined `success` receipt and status 2.
- [ ] No `ARBITRUM_RPC_URL`/orchestrator references remain; `wrangler.toml` has no addresses.
- [ ] `yarn worker:lint`, `yarn worker:test`, typecheck pass.
