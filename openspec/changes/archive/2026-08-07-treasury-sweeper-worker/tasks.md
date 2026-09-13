## 1. Package Scaffold

- [x] 1.1 Create `packages/sweeper/` directory with `package.json` (name: `@ss/sweeper`, deps: `viem`, devDeps: `wrangler`, `typescript`, `@cloudflare/workers-types`)
- [x] 1.2 Create `packages/sweeper/tsconfig.json` matching the conventions of `packages/worker`
- [x] 1.3 Create `packages/sweeper/wrangler.toml` with cron trigger (`[triggers] crons = ["0 */12 * * *"]`), `[vars]` for `VAULT_ADDRESS`, `USDC_ADDRESS`, `CHAIN_ID`, `SWEEP_THRESHOLD_USDC`, and comments for secrets (`ADMIN_PRIVATE_KEY`, `ARBITRUM_RPC_URL`)
- [x] 1.4 Add `packages/sweeper` to the root `package.json` workspaces array

## 2. Core Sweep Logic

- [x] 2.1 Create `packages/sweeper/src/sweep.ts` — pure function `executeSweep(config, provider)` that: reads `paused()`, reads idle USDC via `balanceOf(vault)`, compares against threshold, calls `deployToStrategy(idleBalance)`, then calls `realizeYield()`. Returns a result object with the action taken and relevant values.
- [x] 2.2 Create `packages/sweeper/src/abi.ts` — export the minimal ABI fragments for TreasuryVault (`paused`, `deployToStrategy`, `realizeYield`, `totalAssets`, `strategyDeployed`) and USDC ERC-20 (`balanceOf`)
- [x] 2.3 Create `packages/sweeper/src/config.ts` — type definition for the Worker `Env` interface (secrets + vars) and helper to parse/validate env values at runtime

## 3. Worker Entry Point

- [x] 3.1 Create `packages/sweeper/src/index.ts` — export only a `scheduled` handler (no `fetch` handler). On trigger: build viem client from env, call `executeSweep`, log the result via `console.log` (visible in Cloudflare dashboard logs)

## 4. Tests

- [x] 4.1 Create `packages/sweeper/test/sweep.test.ts` — unit tests for `executeSweep` covering: idle above threshold (deploys + realizes yield), idle below threshold (skips), idle zero (skips), vault paused (skips), deployToStrategy failure (logs error, does not call realizeYield)
- [x] 4.2 Add `test` script to `packages/sweeper/package.json` using vitest or the project's preferred test runner

## 5. Documentation

- [x] 5.1 Update `docs/SDD.md` — add a new subsection (§9.2 or appropriate) documenting the Sweeper Worker: purpose, cron schedule, threshold policy, admin key isolation, and the security boundary between the bot Worker and the sweeper
- [x] 5.2 Update `AGENTS.md` — add `packages/sweeper` to the repository structure tree and add the sweeper's build/deploy commands (`wrangler dev`, `wrangler deploy`, `npm test`)
- [x] 5.3 Update `GEMINI.md` — add the sweeper to the "Piezas clave del sistema" section

## 6. Verification

- [x] 6.1 Run `npm test` in `packages/sweeper` and verify all tests pass
- [x] 6.2 Run `wrangler dev` in `packages/sweeper` to verify the Worker compiles and the cron trigger is registered
- [x] 6.3 Verify the Worker has no HTTP fetch routes by confirming no `fetch` export exists in the entry point
