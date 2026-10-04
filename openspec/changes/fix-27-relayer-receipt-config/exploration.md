# Exploration: fix-27-relayer-receipt-config

Source: GitHub issue #27 (blocked by #26). Basis: DD-08, docs/TESTING.md section 4. Engram: `sdd/fix-27-relayer-receipt-config/explore` (obs 370).

## Current state (packages/worker)

- `src/telegram/chain.ts` already has a single `ChainConfig` and `ChainEnv` (CHAIN_RPC_URL, CHAIN_ID, CHALLENGE_POOL_ADDRESS, USDC_ADDRESS, OPERATOR_PRIVATE_KEY). `configDesdeEnv` gives a message per variable but does not validate the RPC URL.
- `crearChainClient` builds one walletClient; `writer.writeContract` returns the hash with no receipt wait and no nonce handling. `crearReto` waits for the receipt but ignores `status`. `reembolsar` does not wait.
- `handleConfirmar` (`src/telegram/retos.ts` L365-473) announces "resolved" and writes history on broadcast, not on mining.
- Parallel `ARBITRUM_RPC_URL` path: `src/confirmTx.ts` (`createOperatorWriter*`, duplicated `PRIVATE_KEY_FORMAT`), `Env.ARBITRUM_RPC_URL` in `src/index.ts`, a comment in `wrangler.toml`, comments in `src/orchestrator.ts`, tests in `test/confirmTx.test.ts` L258-286. Keep `buildConfirmResultCall` / `buildAndSendConfirmResult` (winner guard).
- `src/orchestrator.ts` is dead in production (only referenced by `test/orchestrator.test.ts`).
- States `fallida` / `confirmada` do not exist. `registerConfirmation` sets `consensusTriggeredFor` before any tx, so a reverted tx blocks retries forever.
- `src/telegram/errores.ts`: `describirErrorDeContrato` covers Solidity custom errors; Stylus short codes (`no_op`, `not_owner`, `nopart`, `depmax`, `vred`, `pay`, `noref`, `claimed`, `refpay`, `inited`, `operator_is_zero`) have no alias. No message for a reverted receipt or non-Resolved status.
- `wrangler.toml` `[vars]` holds CHAIN_ID=5042002 (Arc), RPC and both addresses. `.dev.vars.example` is Arc-based.
- Tests: vitest (`yarn worker:test`); `CadenaFalsa` fake in `test/retos.test.ts`; no viem transport mock.

## Approaches

| Approach | Pros | Cons | Effort |
|---|---|---|---|
| A. `ChainClient.confirmarResultado(challengeId, winner)`: send, wait receipt, check status, read `challengeStatus === 2`, all inside one in-process promise queue | One owner for send/wait/verify/serialize; easy fake; deterministic nonces | One resolution at a time per isolate; guard must wrap it | M |
| B. viem `nonceManager` + receipt wait in `handleConfirmar` | Smaller diff, no blocking on mining | Receipt logic leaks into handler; per-isolate nonce state can desync | M |
| C. Per-account Durable Object (queue + nonce) | Correct across isolates; fits DD-07 | New binding/class; pulls DD-07 into scope | L |

## Recommendation

Approach A. Route `writer`, `crearReto` and `reembolsar` through the same queue and check `receipt.status`. Delete the `ARBITRUM_RPC_URL` path. Add a minimal status (`enviada` / `confirmada` / `fallida`) to `ConfirmationStore` and release `consensusTriggeredFor` on failure. Add Stylus aliases and a reverted-receipt message. Move CHAIN_ID to 421614 and strip all addresses from `wrangler.toml`. Update SDD.md / TESTING.md.

## Risks

- In-process queue only serializes within one isolate; cross-isolate collisions remain (document as best effort or escalate to C).
- `registerConfirmation` semantics change touches existing tests.
- Receipt and nonce behavior needs a manual Sepolia check.
- Arbitrum Sepolia pool/USDC addresses may be stale (redeploy under DD-09); AGENTS.md requires team coordination for shared deployed addresses.
- A deploy without `.dev.vars` or dashboard values makes the bot run "without chain" silently.
