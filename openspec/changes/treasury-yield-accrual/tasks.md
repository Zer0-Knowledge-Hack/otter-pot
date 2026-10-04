# Tasks: Treasury Yield Accrual on Deposit and Redeem (#22)

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~380 (350-420) |
| 400-line budget risk | Medium |
| Chained PRs recommended | No |
| Suggested split | Single PR, 5 conventional commits |
| Delivery strategy | single-pr |
| Chain strategy | pending |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: pending
400-line budget risk: Medium

If the diff exceeds 400 lines, request `size:exception` before opening the PR.

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|------|------|-----------|----------------------|-----------------|-------------------|
| 1 | Pure logic (commit 1) | PR 1 | `cargo test` in treasury_vault | N/A: pure host code | `logic.rs` |
| 2 | Wiring (commit 2) | PR 1 | `cargo stylus check` | devnode section 9 | `lib.rs`, `strategy/mod.rs` |
| 3 | Mock loss hook (commit 3) | PR 1 | `cargo stylus check` (mock_strategy) | devnode `simulateLoss` | `mock_strategy/src/lib.rs` |
| 4 | Devnode scenarios (commit 4) | PR 1 | `tsc` on script | `integration-test-usdc.ts` | script only |
| 5 | Docs (commit 5) | PR 1 | N/A | N/A: docs | `docs/SDD.md` |

## Commit 1: feat(contracts): pure reconcile and share-math helpers (~150)

Path: `packages/stylus/contracts/treasury_vault/src/logic.rs`

- [ ] 1.1 RED: tests for `reconcile` (gain, loss, equal, loss above total saturates to 0, deployed = measured).
- [ ] 1.2 RED: tests for `accrue` (`NoStrategy` and `Unavailable` return None; `Measured` returns Some).
- [ ] 1.3 RED: tests for `shares_for_deposit` (1:1 at zero shares; fair split 100 at 110/100 gives 90909090; `zero_share_price`; `zero_shares_minted`).
- [ ] 1.4 RED: tests for `assets_for_redeem` (floor; post-loss values; 100 deployed then 95 gives 95).
- [ ] 1.5 GREEN: add `BalanceRead`, `YieldDelta`, `Reconciled`, `reconcile`, `accrue`, `shares_for_deposit`, `assets_for_redeem`.
- [ ] 1.6 Remove `positive_yield_delta` and its 3 tests; REFACTOR.
- [ ] 1.7 Verify `cargo test` green.

## Commit 2: feat(contracts): accrue on deposit, redeem, realize_yield (~75)

- [ ] 2.1 Add `try_strategy_balance_of` (ZERO gives NoStrategy; Err or len < 32 gives Unavailable) in `packages/stylus/contracts/treasury_vault/src/contract/strategy/mod.rs`.
- [ ] 2.2 Add `YieldLossRecognized(uint256 lost_assets, uint256 total_assets)` event and private infallible `accrue_yield` in `packages/stylus/contracts/treasury_vault/src/lib.rs`.
- [ ] 2.3 Wire `deposit` per design order (accrue after `zero_assets`, then `shares_for_deposit`) in `lib.rs`.
- [ ] 2.4 Wire `redeem_shares` (accrue after `zero_to`, then `assets_for_redeem`) in `lib.rs`.
- [ ] 2.5 Make `realize_yield` call `require_admin` then `accrue_yield` (not pause-gated) in `lib.rs`.
- [ ] 2.6 Verify `cargo fmt`, `cargo clippy`, `cargo test`, `cargo stylus check` (treasury_vault).

## Commit 3: feat(contracts): owner-only loss simulation in mock_strategy (~25)

- [ ] 3.1 Add `simulate_loss(amount)` (owner-only, transfers USDC to owner, `insufficient_assets` revert) and `LossSimulated(uint256)` in `packages/stylus/contracts/mock_strategy/src/lib.rs`.
- [ ] 3.2 Verify `cargo fmt`, `cargo clippy`, `cargo stylus check` (mock_strategy).

## Commit 4: test(scripts): accrual devnode scenarios (~125)

- [ ] 4.1 Open risk: run the existing section 8.4 on devnode; confirm it passes (owner may hold no vault shares, `insufficient_shares`) BEFORE adding section 9. If it fails, fix 8.4 in this commit.
- [ ] 4.2 Add `simulateLoss`, `LossSimulated` and `YieldLossRecognized` ABI strings in `packages/stylus/scripts/integration-test-usdc.ts`.
- [ ] 4.3 Add TS floor-math mirror helpers computed from on-chain pre-state (shared vault is not empty).
- [ ] 4.4 Add `runAccrualTests` (local only, after section 8) with scenarios: fair split, loss plus last-redeemer, no strategy (`setStrategy(0)` after `withdrawAllFromStrategy`), failed read (`setStrategy(<EOA>)`, price unchanged), restore strategy.
- [ ] 4.5 Run the devnode script; all sections pass.

## Commit 5: docs(sdd): accrual guards, DD-05 implemented (~5)

- [ ] 5.1 Update the section 7.2 sentence (skip on failed read, loss event, zero-share guards) and the DD-05 row status (line ~782) in `docs/SDD.md`.

## Final verification

- [ ] 6.1 `cargo test` green after every commit.
- [ ] 6.2 No edit to `packages/worker/contracts/TreasuryVault.abi.json` (design: no change).
- [ ] 6.3 Confirm diff is within 400 changed lines; otherwise request `size:exception`.
