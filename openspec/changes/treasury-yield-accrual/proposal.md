# Proposal: Treasury Yield Accrual on Deposit and Redeem (#22)

## Intent

`TreasuryVault` only recognises yield when the admin calls `realize_yield`, and never recognises losses. Deposits and redemptions therefore use a stale share price: late depositors capture earlier holders' yield, and after a strategy loss the vault promises assets it no longer has. Accrual must happen automatically, in both directions, before every share-price-dependent operation.

## Scope

### In Scope
- Pure `logic::reconcile` (+ share-math helpers) with strict-TDD unit tests.
- Private `accrue_yield` called in `deposit` and `redeem_shares` before price math; `realize_yield` = `require_admin` + `accrue_yield`.
- Failure-aware strategy balance read: a failed/short read SKIPS accrual (previous price kept); no strategy = no-op.
- Recognise losses: decrease `total_assets` and `strategy_deployed` by the measured delta.
- New additive loss event; `packages/worker/contracts/TreasuryVault.abi.json` updated (sweeper has no vault ABI file today).
- 1:1 mint only when `total_shares == 0`; reject zero-share mints.
- Owner-only loss hook in `mock_strategy`.
- Devnode scenarios: fair split, loss, no-strategy.
- SDD status row flip.

### Out of Scope
- TreasuryVault redeploy (#24).
- motsu/host harness for the `contract` module.
- Revert-on-failed-read policy.

## Capabilities

### New Capabilities
- None

### Modified Capabilities
- `treasury-vault`: "Yield realization" becomes automatic, bidirectional accrual (losses recognised, failed read skips, loss event); "USDC deposit minting shares" changes the 1:1 condition to `total_shares == 0` and rejects zero-share mints; "Redeem shares for USDC" accrues first and tolerates post-loss shortfall.

## Approach

Exploration Approach 1: pure `logic::reconcile(total_assets, strategy_deployed, measured) -> (new_total_assets, new_deployed, delta)` tested on host; thin `accrue_yield` wrapper in `lib.rs` consuming a `Result`-style balance read. Order: `require_not_paused`, validation, `accrue_yield`, price/share math, existing CEI flow. Wiring verified by devnode script and `cargo stylus check`.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `packages/stylus/contracts/treasury_vault/src/logic.rs` | Modified | `reconcile`, share-math helpers, tests |
| `packages/stylus/contracts/treasury_vault/src/lib.rs` | Modified | `accrue_yield`, loss event, mint guards |
| `packages/stylus/contracts/treasury_vault/src/contract/strategy/mod.rs` | Modified | Failure-aware balance read |
| `packages/stylus/contracts/mock_strategy/src/lib.rs` | Modified | Owner-only loss hook |
| `packages/stylus/scripts/integration-test-usdc.ts` | Modified | Fair-split, loss, no-strategy scenarios |
| `packages/worker/contracts/TreasuryVault.abi.json` | Modified | Additive loss event |
| `docs/SDD.md`, `openspec/specs/treasury-vault/spec.md` | Modified | Status row; delta spec at archive |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Failed read wipes accounting | Med | Distinct error path; skip accrual |
| Total loss dilutes holders / div-by-zero | Low | 1:1 only at `total_shares == 0`; zero-share mint rejected |
| Rounding drift | Low | Floor on mint/redeem; deployed mirrors last measurement |
| Contract logic not host-testable | Med | Logic in `logic.rs`; devnode scenarios |
| Exceeds 400-line budget | Med | Single PR, scoped commits |

## Rollback Plan

Revert the PR. No deployment occurs in this change (#24 redeploys), so live contracts and worker ABI consumers are unaffected; the event is additive.

## Dependencies

- Local Nitro devnode for script scenarios; #24 for deployment.

## Success Criteria

- [ ] Fair split: A 100, +10 unrealised yield, B 100 => A redeems 110, B 100.
- [ ] Loss 100->95: last redeemer receives 95, no revert; loss event emitted.
- [ ] Share price never drops except on recognised loss; failed read leaves price unchanged.
- [ ] No-strategy behaviour unchanged.
- [ ] `cargo fmt`, `cargo clippy`, `cargo test`, `cargo stylus check` pass.
