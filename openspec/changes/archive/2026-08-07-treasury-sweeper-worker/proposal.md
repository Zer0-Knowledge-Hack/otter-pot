## Why

The TreasuryVault accumulates idle USDC from challenge deposits, but `deployToStrategy` is restricted to the admin account (SDD §5.3.3, §7.3). Today this requires a human operator to manually run a script each time capital should move to Aave. This creates two problems:

1. **Operational burden**: the admin must monitor idle balances 24/7 and decide when to sweep, which is unsustainable.
2. **Security risk of mixing keys**: if the sweep logic were added to the existing bot Worker (`packages/worker`), the admin private key would live alongside the Telegram webhook — a public-facing endpoint. A compromise of the bot Worker would expose the key that controls treasury strategy operations.

A dedicated, non-public Cloudflare Worker running on a Cron Trigger solves both: it automates the sweep on a schedule, and it isolates the admin key in a Worker with no HTTP routes exposed to the internet.

## What Changes

- **New package `packages/sweeper`**: a standalone Cloudflare Worker (TypeScript) with no HTTP fetch handler — only a `scheduled` event handler triggered by Cloudflare Cron.
- **Cron-driven sweep logic**: on each trigger the Worker reads the vault's idle USDC balance; if it exceeds a configurable threshold it calls `deployToStrategy(idleBalance)` and optionally `realizeYield()` to update the vault's accounting.
- **Admin key isolation**: the Worker stores `ADMIN_PRIVATE_KEY` as a Cloudflare secret, separate from the bot Worker's `OPERATOR_PRIVATE_KEY`. No HTTP routes are exposed.
- **SDD update (`docs/SDD.md`)**: a new subsection documenting the Sweeper Worker as an infrastructure component, its cron schedule, threshold policy, and security boundary.
- **AGENTS.md update**: add `packages/sweeper` to the repository structure description.

## Capabilities

### New Capabilities
- `treasury-sweeper`: Automated cron-based sweep of idle USDC from TreasuryVault into the active yield strategy, with configurable threshold and schedule, running in an isolated Cloudflare Worker that holds only the admin key.

### Modified Capabilities
_(none — the TreasuryVault contract and its spec are unchanged; the sweeper is a new off-chain consumer of existing admin-only functions)_

## Impact

- **New package**: `packages/sweeper` with its own `wrangler.toml`, `package.json`, `tsconfig.json`, source, and tests.
- **Monorepo config**: the root `package.json` workspace list gains `packages/sweeper`.
- **Cloudflare deployment**: a second Worker deployment target, with its own secrets (`ADMIN_PRIVATE_KEY`, `ARBITRUM_RPC_URL`) managed via `wrangler secret`.
- **docs/SDD.md**: new subsection under §5 or §9 describing the Sweeper Worker.
- **AGENTS.md / GEMINI.md**: updated repo tree to include `packages/sweeper`.
- **No contract changes**: the sweeper calls existing public ABI functions (`deployToStrategy`, `realizeYield`, `totalAssets`, `strategyDeployed`, and `balanceOf` on the USDC ERC-20) that are already restricted to the admin on-chain.
