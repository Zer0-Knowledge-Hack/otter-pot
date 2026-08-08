## Context

The `ChallengePool` contract already stores `base_commission_rate` and exposes `set_commission_rate` behind an owner guard. The current implementation only enforces `rate_bps <= 1_000` (10%), which is wider than the SDD §8.1 business range of 2–5%. There is no event emitted on rate change, no view to read the current rate, and no operational tooling to invoke the function from a CLI. See proposal.md for the full motivation.

The existing main spec at `openspec/specs/challenge-pool/spec.md` defines resolution and refund behavior but does not specify commission rate constraints or mutation events.

## Goals / Non-Goals

**Goals:**

- Emit an indexed `CommissionRateUpdated` event on every rate mutation for auditability.
- Add a `commissionRate()` view so scripts and external consumers can query the active rate.
- Provide a ready-to-use `set-rate.ts` CLI script that reads the pool address from deployments and calls `setCommissionRate`.
- Extend the integration test to exercise a rate change before resolution and assert the payout matches the new rate.
- Update SDD §8.1 and `IChallengePool.sol` to reflect the final design.

**Non-Goals:**

- Per-challenge commission snapshots (the rate is global and read at resolution time — this is the current design and we are not changing it).
- Governance / timelock for rate changes — the owner controls it directly, consistent with the current admin model.
- Changing the `resolve_payout` logic — it already takes `commission_rate_bps` as a parameter and computes correctly.

## Decisions


### D3: `CommissionRateUpdated` event with indexed fields

**Choice:** `event CommissionRateUpdated(uint256 indexed previousRate, uint256 indexed newRate)`. Both fields are indexed for efficient log filtering.

**Alternative considered:** A single `newRate` field. Rejected because the previous rate provides an audit trail without requiring a historical event scan.

### D4: `commissionRate()` view function

**Choice:** A simple getter `pub fn commission_rate(&self) -> Result<U256, Vec<u8>>` returning `self.base_commission_rate.get()`. On-chain name becomes `commissionRate()`.

**Why:** Without this, scripts and the Worker need to either parse init transaction logs or call `setCommissionRate` with a dry-run — neither is ergonomic. A view is the standard EVM pattern.

### D5: `set-rate.ts` script design

**Choice:** A standalone script in `packages/stylus/scripts/` reusing the existing `parseArgs` / `resolveTarget` / `getSigner` utilities from `otter.ts`. It accepts `--rate <bps>` (required), and optionally `--pool <address>` (falls back to `deployments/<chainId>_latest.json`). It reads the current rate via `commissionRate()`, calls `setCommissionRate`, and prints old → new.

**Why not integrate into `deploy.ts`?** Rate changes are operational, not deployment-time. A separate script keeps concerns separated and can be run independently.

### D6: Integration test — rate change before challenge creation

**Choice:** Insert a new step in `integration-test-usdc.ts` (between step 2 and step 3) that calls `setCommissionRate(300)`, reads back the rate with `commissionRate()`, and asserts it changed. The existing resolution assertion in step 6 is updated to compute expected commission at 300 bps instead of the default 500.

**Why 300 bps?** It's a valid value different from the default (500) that produces a clearly distinguishable payout, making the assertion meaningful. Also ensures the payout formula `recovered * 300 / 10_000` works with typical USDC amounts without rounding issues.

## Risks / Trade-offs

| Risk | Mitigation |
|---|---|
| `CommissionRateUpdated` event adds ~375 gas per rate change | Rate changes are rare admin operations; negligible cost. |
| `CommissionRateUpdated` event adds ~375 gas per rate change | Rate changes are rare admin operations; negligible cost. |
| Integration test becomes longer | The added step is ~10 lines and runs in <2s on the devnode. |
