## Context

See proposal.md — Why. The TreasuryVault exposes `deployToStrategy`, `realizeYield`, `paused`, and the read-only views `totalAssets`, `strategyDeployed` as admin-only functions (SDD §5.3.3, §7.3). The existing bot Worker (`packages/worker`) holds only the operator key. The sweeper is a new off-chain consumer of admin-only functions, deployed as a separate Cloudflare Worker.

The current monorepo uses yarn workspaces with packages at `packages/stylus`, `packages/nextjs`, and `packages/worker`. The sweeper will follow the same convention at `packages/sweeper`.

## Goals / Non-Goals

**Goals:**
- Automate the deployment of idle USDC to the yield strategy on a configurable schedule.
- Isolate the admin private key in a Worker with zero public HTTP surface.
- Keep the implementation minimal and auditable (single-purpose Worker).
- Provide clear logs of every sweep cycle for ops visibility.

**Non-Goals:**
- Modifying TreasuryVault or any on-chain contract.
- Handling strategy migration, `withdrawFromStrategy`, or `setPaused` — those remain manual admin operations.
- Providing an API or dashboard for the sweeper — it is a fire-and-forget cron job with logs only.
- Supporting multiple vaults or multiple chains in the same Worker.

## Decisions

### D1: Standalone Worker vs. Cron route in the bot Worker

**Decision:** Standalone Worker (`packages/sweeper`) with only a `scheduled` handler.

**Alternatives considered:**
- *Add a cron trigger to `packages/worker`*: Rejected because it would require storing `ADMIN_PRIVATE_KEY` alongside the Telegram webhook handler — a public-facing HTTP endpoint. A compromise of the bot Worker would expose treasury admin capabilities. The SDD §11 and AGENTS.md explicitly prohibit giving the operator key treasury-moving powers; mixing the admin key into the same runtime contradicts this principle.
- *External cron service (GitHub Actions, etc.)*: Rejected because it adds an external dependency and the admin key would need to be stored outside the Cloudflare security perimeter. The monorepo already uses Cloudflare Workers.

### D2: Sweep all idle vs. partial sweep

**Decision:** Sweep the entire idle balance when it exceeds the threshold.

**Rationale:** On Arbitrum, gas costs for `deployToStrategy` are effectively constant regardless of amount (~$0.01–0.05). There is no benefit to leaving a partial balance idle once the threshold is met. Sweeping everything maximizes capital efficiency and simplifies the logic. The threshold itself prevents uneconomical micro-sweeps.

### D3: Default cron schedule and threshold

**Decision:** Default cron every 12 hours (`0 */12 * * *`), default threshold of 10 USDC.

**Rationale:** 12 hours balances capital efficiency against cron execution costs. On Arbitrum Sepolia (and later Arbitrum One), gas is cheap enough that running twice a day is economical even for modest volumes. The 10 USDC threshold prevents dust sweeps. Both are configurable via `wrangler.toml` vars so the admin can adjust without code changes.

### D4: `realizeYield` call after deployment

**Decision:** Call `realizeYield()` after a successful `deployToStrategy` to keep the vault's `strategyDeployed` accounting current.

**Rationale:** `realizeYield` compares the strategy's `balanceOf()` against the vault's `strategyDeployed` record. By calling it right after deploying, we ensure the new deployment is accounted for and any accrued yield from Aave since the last realization is captured. This is safe to call repeatedly (it is a no-op if no new yield exists).

### D5: Transaction construction library

**Decision:** Use `viem` (the same library the bot Worker already uses for chain interaction).

**Alternatives considered:**
- *ethers.js*: The stylus scripts use ethers, but the Worker ecosystem already standardized on viem. Using the same library as the bot Worker reduces mental overhead and package duplication.

### D6: Configuration via environment variables

**Decision:** All configurable parameters are set in `wrangler.toml` `[vars]` (non-secret) or `wrangler secret` (sensitive):

| Parameter | Source | Default |
|---|---|---|
| `ADMIN_PRIVATE_KEY` | `wrangler secret` | _(required)_ |
| `ARBITRUM_RPC_URL` | `wrangler secret` | _(required)_ |
| `VAULT_ADDRESS` | `[vars]` | _(required)_ |
| `USDC_ADDRESS` | `[vars]` | _(required)_ |
| `CHAIN_ID` | `[vars]` | `421614` (Arbitrum Sepolia) |
| `SWEEP_THRESHOLD_USDC` | `[vars]` | `10` |

## Risks / Trade-offs

| Risk | Mitigation |
|---|---|
| Admin key compromise via Cloudflare Worker runtime | The Worker has no HTTP routes (no `fetch` handler). The only trigger is the Cloudflare cron scheduler, which is internal to Cloudflare's infrastructure and not externally invocable. Key is stored as a Cloudflare secret, encrypted at rest. |
| `deployToStrategy` reverts due to vault being paused | The sweeper checks `paused()` before attempting any transaction. If paused, it logs and exits cleanly. |
| Temporary RPC outage causes missed sweep | The next cron cycle (12h later) will retry automatically. No state is lost — idle USDC simply remains in the vault until the next successful sweep. |
| Gas spike on Arbitrum makes sweep uneconomical | Arbitrum L2 gas is typically < $0.05. Even a 10x spike is < $0.50, well within the economic benefit of deploying any amount above the 10 USDC threshold. Not a practical risk for the MVP. |
| Sweeper deploys capital right before a large redemption, causing unnecessary withdrawFromStrategy | Acceptable trade-off: the vault handles shortfall automatically (spec §"Redeem when idle balance is insufficient"). The extra gas of the strategy withdrawal is borne by the system, not the user. |
