# Design: Treasury Yield Accrual on Deposit and Redeem (#22)

## Technical Approach

All accounting decisions move into pure, host-tested `logic.rs` (reconcile, skip policy, share math). `lib.rs` gets one thin, infallible `accrue_yield` that reads the strategy through a failure-aware wrapper, applies `logic::accrue`, writes storage, and emits an event. `deposit`, `redeem_shares` and `realize_yield` call it before any price math. Wiring is verified by `cargo stylus check` and devnode scenarios.

## Architecture Decisions

| Topic | Options | Decision / rationale |
|---|---|---|
| Balance read | Keep `U256` (0 on error) / `Result` / tri-state enum | Enum `logic::BalanceRead { NoStrategy, Measured(U256), Unavailable }`. Distinguishes "no strategy" from "failed or short read" and is host-testable. Existing `strategy_balance_of` stays for `deploy_to_strategy`/`withdraw_all_from_strategy` (unchanged behaviour). |
| Failed read | Skip / revert | Skip (proposal). `Unavailable` and `NoStrategy` both return `None`, so no write and no event. |
| Loss event | Reuse `YieldRealized` with sign / new event | New additive `YieldLossRecognized(uint256 lost_assets, uint256 total_assets)`, mirroring `YieldRealized`. Gains keep `YieldRealized`. |
| Share math | Keep price-based `/price` / direct mul-div | Direct mul-div helpers (floor). Same results on the fair-split case, one fewer rounding step, no zero-price division. `price_per_share` view unchanged. |
| Zero assets with shares | Mint 1:1 / reject | Reject with `zero_share_price`; 1:1 only when `total_shares == 0`. |
| Zero-share mint | Allow / reject | Reject with `zero_shares_minted`. |
| Zero-asset redeem (after total loss) | Revert / allow | Allow: shares burn and 0 is transferred; matches "redeemer gets what exists". |
| `positive_yield_delta` | Keep / delete | Delete with its 3 tests; `reconcile` replaces it (one source of truth). |
| Mock loss hook | Burn / transfer to owner | `simulate_loss(amount)`, owner-only: transfers `amount` USDC to owner, emits `LossSimulated(uint256 amount)`, reverts `insufficient_assets`. |
| Worker ABI | Add event / no change | **No change** (deviates from proposal). `packages/worker/contracts/TreasuryVault.abi.json` contains functions only (no events, not even `YieldRealized`), and no function signature changes. `packages/sweeper/src/abi.ts` only uses `realizeYield()`, unchanged. |

## Interfaces / Contracts

```rust
// logic.rs
pub enum BalanceRead { NoStrategy, Measured(U256), Unavailable }
pub enum YieldDelta { None, Gain(U256), Loss(U256) }
pub struct Reconciled { pub total_assets: U256, pub deployed: U256, pub delta: YieldDelta }

pub fn reconcile(total_assets: U256, deployed: U256, measured: U256) -> Reconciled;
// gain: total.saturating_add(g); loss: total.saturating_sub(l); deployed = measured
pub fn accrue(total_assets: U256, deployed: U256, read: BalanceRead) -> Option<Reconciled>;
// None for NoStrategy | Unavailable
pub fn shares_for_deposit(assets: U256, total_assets: U256, total_shares: U256)
    -> Result<U256, &'static [u8]>; // zero_share_price | zero_shares_minted
pub fn assets_for_redeem(shares: U256, total_assets: U256, total_shares: U256) -> U256;

// contract/strategy/mod.rs
pub fn try_strategy_balance_of(c: &TreasuryVault, strategy: Address) -> logic::BalanceRead;
// ZERO -> NoStrategy; Err or out.len() < 32 -> Unavailable; else Measured

// lib.rs (private, infallible)
fn accrue_yield(&mut self); // writes only when Some; emits per YieldDelta
```

## Data Flow

```
deposit:  not_paused -> zero_assets -> accrue_yield -> shares_for_deposit? -> writes -> transferFrom -> balance check -> Deposit
redeem:   not_paused -> zero_shares -> holder/total checks -> zero_to -> accrue_yield -> assets_for_redeem -> writes -> shortfall withdraw -> transfer -> Redeem
realize:  require_admin -> accrue_yield  (not pause-gated)

accrue_yield: strategy ─static_call balanceOf─> BalanceRead ─logic::accrue─> Option<Reconciled> ─> storage + event
```

Accrual is a static call to the admin-set strategy before any write or transfer, so CEI is preserved. A later revert rolls accrual back with the rest of the transaction.

## File Changes

| File | Action | Description |
|---|---|---|
| `packages/stylus/contracts/treasury_vault/src/logic.rs` | Modify | Types and functions above, unit tests; remove `positive_yield_delta` |
| `packages/stylus/contracts/treasury_vault/src/contract/strategy/mod.rs` | Modify | `try_strategy_balance_of` |
| `packages/stylus/contracts/treasury_vault/src/lib.rs` | Modify | Event, `accrue_yield`, wiring, helper-based share math |
| `packages/stylus/contracts/mock_strategy/src/lib.rs` | Modify | `simulate_loss`, `LossSimulated` |
| `packages/stylus/scripts/integration-test-usdc.ts` | Modify | Section 9 scenarios, ABI strings |
| `docs/SDD.md` | Modify | §7.2 sentence (skip on failed read, loss event, zero-share guards); line 782 row status |

## Testing Strategy

| Layer | What | Approach |
|---|---|---|
| Unit (strict TDD) | `reconcile` gain/loss/equal/loss above total (saturates); `accrue` skips on `NoStrategy`/`Unavailable`; `shares_for_deposit` 1:1 at zero shares, fair split (100, 110/100 -> 90909090 units at 6 decimals), `zero_share_price`, `zero_shares_minted`; `assets_for_redeem` floor and post-loss values | `cargo test` in `logic.rs`, RED before GREEN |
| Devnode | Fair split; loss (`simulateLoss`, redeem succeeds, `YieldLossRecognized` emitted); no strategy (`setStrategy(0)` after `withdrawAllFromStrategy`, totals move only by assets); failed read (`setStrategy(<EOA>)`, deposit succeeds, price unchanged); restore strategy | New `runAccrualTests` after section 8, local only. Expected values come from a TS floor-math mirror applied to the on-chain pre-state, because the shared vault is not empty; the literal 110/100 and 95 hold on a fresh devnode |
| Build | WASM wiring | `cargo fmt`, `cargo clippy`, `cargo stylus check` for both contracts |

## Threat Matrix

N/A — no routing, shell, subprocess, VCS/PR automation, executable-file classification, or process-integration boundary.

## Commit Plan (single PR, ~380 lines)

1. `feat(contracts): add pure reconcile and share-math helpers to treasury logic` (~150)
2. `feat(contracts): accrue yield on deposit, redeem and realize_yield` (~75)
3. `feat(contracts): add owner-only loss simulation to mock_strategy` (~25)
4. `test(scripts): cover fair split, loss, no-strategy and failed-read accrual` (~125)
5. `docs(sdd): document accrual guards and mark DD-05 implemented` (~5)

Each commit keeps `cargo test` green.

## Migration / Rollout

No migration. Storage layout unchanged; redeploy belongs to #24.

## Open Questions

- [ ] Section 8.4 redeems as `owner`, who may hold no vault shares (`insufficient_shares`); confirm it currently passes before adding section 9.
- [ ] A redeem that returns 0 after a total loss reaches `ChallengePool`; DD-01's "abort on zero" belongs to #19.
