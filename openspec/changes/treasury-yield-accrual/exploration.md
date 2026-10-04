# Exploration: treasury-yield-accrual (issue #22)

## Current State
- Code: `packages/stylus/contracts/treasury_vault/src/lib.rs` (`contract` module, wasm32/export-abi only); pure helpers in `src/logic.rs`; strategy wrappers in `src/contract/strategy/mod.rs`.
- `deposit`: `require_not_paused` -> `price_per_share` -> `shares = assets` if `total_assets == 0`, else `assets*1e18/price` -> state writes -> `transferFrom` -> balance check.
- `redeem_shares`: `assets = shares*price/1e18`, burn, `total_assets.saturating_sub(assets)`, `strategy_withdraw(shortfall)` if idle USDC is short, transfer.
- `realize_yield` (admin): saturating positive delta only; losses are never recognised; no-op without a strategy.
- `strategy_balance_of` returns `0` both when no strategy is set and when the static call fails or returns short data.
- `mock_strategy`: `mint` simulates yield; there is no way to simulate a loss.
- Docs (SDD §7.2, DD-05, TESTING §3.4) already describe the target behaviour; only the SDD status row (~line 782, "Pendiente") needs flipping after implementation.

## Test Infrastructure
- Only `logic.rs` is host-testable (9 unit tests). The `contract` module is cfg-gated; stylus-sdk 0.8 has no motsu/host harness.
- End-to-end scenarios: `packages/stylus/scripts/integration-test-usdc.ts` (`runStrategyTests`, section 8), local Nitro devnode only.

## Affected Areas (under `packages/stylus/` unless noted)
- `contracts/treasury_vault/src/logic.rs`: new `reconcile` + share-math helpers + unit tests.
- `contracts/treasury_vault/src/lib.rs`: private `accrue_yield`, called in `deposit` and `redeem_shares`, reused by `realize_yield`.
- `contracts/mock_strategy/src/lib.rs`: owner-only loss hook.
- `scripts/integration-test-usdc.ts`: fair-split, loss, no-strategy scenarios.
- `docs/SDD.md`: status row.
- Worker/sweeper ABI files only if a new event is added (additive).

## Approaches
1. **Pure `logic::reconcile` + private `accrue_yield` (recommended).** TDD on host; minimal surface; wiring verified via devnode script and `cargo stylus check`. Effort: low-medium.
2. Inline in `lib.rs`. Smallest diff, untestable on host. Effort: low.
3. Add a motsu/stylus-test harness. SDK upgrade, large scope for a bug fix. Effort: high. Not recommended.

## Recommendation
Approach 1. Order in `deposit` and `redeem_shares`: `require_not_paused`, input validation, `accrue_yield`, price/share math, existing CEI flow. `realize_yield` = `require_admin` + `accrue_yield`.

## Risks
- **HIGH: failed balance read.** A failed/short static call returns 0; with down-accrual this would wipe `total_assets` and `strategy_deployed`. Accrual needs a failure-aware read and must never reconcile on error.
- **Total loss with shares outstanding.** `total_assets == 0` with `total_shares > 0` makes `deposit` mint 1:1 and dilute holders; zero price risks division by zero. Use the 1:1 branch only when `total_shares == 0`; reject zero-share mints.
- **Rounding.** Floor on mint and redeem; `strategy_deployed` mirrors the last measured balance and `total_assets` moves by the same delta.
- **Shortfall.** After a recognised loss the last redeemer gets what exists (95) and `mock.withdraw` does not revert.
- **Ordering.** Accrual is a static call to the trusted strategy before any write/transfer; CEI preserved; accrual runs before price computation. Paused vault does not accrue; `realize_yield` is not pause-gated.
- **Empty vault.** Yield accrued while `total_shares == 0` goes to the first depositor (negligible; document).
- **Mock gap.** Loss test needs a mock-only change; vault redeploy belongs to #24.
- **Events.** `YieldRealized` covers gains only; a loss event would be additive.

## Open Decisions for the Proposal
1. Failed balance read: skip accrual vs revert.
2. Zero-assets-with-shares guard and zero-share-mint rejection.
3. `mock_strategy` loss hook.
4. Whether to add a loss event.
5. Test layering: `logic.rs` unit tests + devnode script, no motsu.

## Ready for Proposal
Yes.
