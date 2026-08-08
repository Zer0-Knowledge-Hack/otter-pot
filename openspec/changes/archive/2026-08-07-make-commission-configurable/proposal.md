## Why

The `ChallengePool` contract initializes its commission rate at deployment time via `init()` (e.g. 500 bps = 5%) and exposes `setCommissionRate` to let the owner change it post-deployment. However, the on-chain function only enforces a ceiling of 1 000 bps (10%) — it does not enforce the SDD §8.1 business range of 2–5%. Additionally, there is no operational script to invoke `setCommissionRate` from a CLI, and no integration test verifies that a changed rate actually propagates to resolution payouts. This change closes those gaps so the commission rate is truly configurable **and validated** post-deployment.

## What Changes

- **Add a lower-bound validation** to `set_commission_rate` in the Rust contract so only values within the SDD §8.1 range (200–500 bps) are accepted, replacing the current ceiling-only check (≤ 1 000 bps).
- **Emit a `CommissionRateUpdated` event** when the rate changes, satisfying SDD §13 (every operation must emit a verifiable event).
- **Add a `commissionRate()` view function** so external consumers (Worker, scripts, Mini App) can read the current rate without relying on events.
- **Create a new `set-rate.ts` script** in `packages/stylus/scripts/` that reads the pool address from `deployments/<chainId>_latest.json` (or a `--pool` flag) and calls `setCommissionRate(newRateBps)` from the owner wallet.
- **Extend the integration test** (`integration-test-usdc.ts`) with a step that changes the commission to a non-default value (e.g. 300 bps) before creating the challenge, then asserts the resolved payout uses the new rate.
- **Update `IChallengePool.sol`** to reflect the new event, the tightened NatSpec on `setCommissionRate`, and the new `commissionRate()` view.
- **Update `docs/SDD.md` §8.1** to document the exact enforceable range (200–500 bps) and the ability to change the rate post-deployment.

## Capabilities

### New Capabilities

_(none — all changes extend the existing challenge-pool capability)_

### Modified Capabilities

- `challenge-pool`: The commission rate validation is tightened from "max 1 000 bps" to "between 200 and 500 bps", a new event `CommissionRateUpdated` is emitted on mutation, and a `commissionRate()` view is added. An operational script and integration-test coverage are added.

## Impact

- **Smart contract (`challenge_pool`)**: `set_commission_rate` gains a lower bound and emits a new event; new `commission_rate` view function; `logic.rs` gains a `validate_commission_rate` helper with unit tests.
- **Solidity interface (`IChallengePool.sol`)**: new event declaration, updated NatSpec, new view function.
- **Scripts (`packages/stylus/scripts/`)**: new `set-rate.ts`; modified `integration-test-usdc.ts`.
- **Documentation (`docs/SDD.md`)**: §8.1 updated to state the enforceable range and configurability.
- **ABI consumers (Worker, Mini App)**: no breaking change — `setCommissionRate` signature is unchanged; new event and view are additive.
