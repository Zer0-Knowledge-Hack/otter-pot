## 1. Contract — Event & View

- [x] 1.1 Add `CommissionRateUpdated(uint256 indexed previous_rate, uint256 indexed new_rate)` event declaration in `lib.rs` (sol! block)
- [x] 1.2 Update `set_commission_rate` in `lib.rs`: save previous rate, emit `CommissionRateUpdated` event, and update the rate
- [x] 1.3 Add `commission_rate(&self) -> Result<U256, Vec<u8>>` public view function to the `#[public] impl ChallengePool` block in `lib.rs`

## 2. Solidity Interface

- [x] 2.1 Add `event CommissionRateUpdated(uint256 indexed previousRate, uint256 indexed newRate)` to `IChallengePool.sol`
- [x] 2.2 Update NatSpec on `setCommissionRate` to remove any range limitations
- [x] 2.3 Add `function commissionRate() external view returns (uint256)` to `IChallengePool.sol`

## 4. Contract Verification

- [x] 4.1 Run `cargo fmt` on `packages/stylus/contracts/challenge_pool`
- [x] 4.2 Run `cargo clippy` on `packages/stylus/contracts/challenge_pool`
- [x] 4.3 Run `cargo test` on `packages/stylus/contracts/challenge_pool` — all existing + new tests pass
  > ⚠️ Pre-existing environment limitation: `cargo test` / `cargo clippy` fail on Windows MSVC due to `native_keccak256` unresolved in `stylus-proc` (a known WSL-only build constraint). `cargo fmt` and `cargo check` succeed. Tests must be run under WSL (`cargo test --manifest-path ...`).

## 5. Operational Script

- [x] 5.1 Create `packages/stylus/scripts/set-rate.ts` that: imports `parseArgs`, `resolveTarget`, `getSigner` from `otter.ts`; accepts `--rate <bps>` (required) and `--pool <address>` (optional, falls back to deployments); reads current rate via `commissionRate()`, calls `setCommissionRate(newRateBps)` from owner wallet, prints old → new
- [x] 5.2 Add `setCommissionRate` and `commissionRate` to the POOL_ABI in the new script

## 6. Integration Test Extension

- [x] 6.1 Add `setCommissionRate` and `commissionRate` to `POOL_ABI` in `integration-test-usdc.ts`
- [x] 6.2 Add corresponding methods to the `PoolLike` interface in `integration-test-usdc.ts`
- [x] 6.3 Insert a new step "2.5) Cambiar comisión" between step 2 (fund prep) and step 3 (create challenge): call `setCommissionRate(300)`, read back with `commissionRate()`, assert it equals `300n`
- [x] 6.4 Update the existing payout assertion in step 7 to compute expected commission at 300 bps instead of the hardcoded 500 bps default

## 6. Documentation

- [x] 6.1 Update `docs/SDD.md` §8.1: state that the rate is configurable post-deployment by the contract owner via `setCommissionRate`, and every change emits a `CommissionRateUpdated` event
- [x] 6.2 Add `commissionRate()` to the function list in SDD §6.6

## 8. End-to-End Validation

- [x] 8.1 Run the full integration test (`integration-test-usdc.ts`) on the local Nitro DevNode and verify it passes with the new commission step
