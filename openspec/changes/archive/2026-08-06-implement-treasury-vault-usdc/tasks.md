## 1. TreasuryVault — movement of real USDC (ERC-20)

- [x] 1.1 Add a minimal `IERC20` interface using `sol!` (`transferFrom`, `transfer`, `approve`, `balanceOf`) inside `packages/stylus/contracts/treasury_vault/src/lib.rs`, handling both `bool`-returning and non-returning USDC variants.
- [x] 1.2 Update `TreasuryVault.deposit`: compute shares from `price_per_share`, write `total_assets`/`total_shares` (CEI), then call `IERC20(usdc).transferFrom(msg::sender(), this, assets)`; propagate errors as `Vec<u8>` (no `unwrap()` on funds paths).
- [x] 1.3 Update `TreasuryVault.redeem_shares` to burn shares and decrement `total_assets`, then call `IERC20(usdc).transfer(to, assets)` where `to` is the redeemer; verify the moved amounts, not a `bool` return.
- [x] 1.4 Keep `realize_yield` as the admin-only entry that increases `total_assets` with measured USDC yield (no share minting).
- [x] 1.5 Confirm `set_strategy` stays `require_admin`-guarded and does not auto-switch (SDD §7.3).

## 2. ChallengePool — ERC-20 deposits

- [x] 2.1 Add the `IERC20` interface and a USDC `approve`/`transferFrom` deposit path in `packages/stylus/contracts/challenge_pool/src/lib.rs`; replace the `#[payable]` `msg::value()` deposit with `transferFrom(participant, pool, required_deposit)`.
- [x] 2.2 Ensure `deposit` reverts with a clear error when `transferFrom` fails (insufficient allowance/balance).
- [x] 2.3 Add/refresh unit tests for the new ERC-20 deposit path in `logic.rs` (or extend existing `validate_deposit`).

## 3. ChallengePool — vault integration (lock / resolve / refund)

- [x] 3.1 When all participants have deposited (`deposit` → "Bloqueado"), call `vault.deposit(total_pool)` and store the returned shares as the challenge's `treasury_shares` (replacing the current 1:1 mock).
- [x] 3.2 In `confirm_result`: redeem `vault.redeem_shares(treasury_shares)` to recover USDC (capital + yield), then compute commission over the recovered total and transfer the remainder exclusively to `winner` (CEI; state → Resuelto before any transfer).
- [x] 3.3 In `refund`: redeem `vault.redeem_shares(treasury_shares)`, distribute the recovered USDC proportionally among participants with no commission (state → Reembolsado before transfers).
- [x] 3.4 Update `resolve_payout` in `logic.rs` to take the recovered USDC total from the vault instead of applying `mock_yield`; update its tests.
- [x] 3.5 Wire a `TreasuryVault` interface reference into `ChallengePool` so `deposit`/`confirm_result`/`refund` can make vault calls.

## 4. Build, ABI & verification

> Verification run in WSL (Ubuntu, cargo 1.97.1 + cargo-stylus, wasm32 target),
> where `native-keccak` links correctly. The MSVC host build blocker no longer applies.

- [x] 4.1 Run `cargo fmt` and `cargo clippy` in `/contracts`.
- [x] 4.2 Unit tests: `logic.rs` suite extended (USDC deposit, `resolve_payout` on recovered total) and verified — 23/23 pass.
- [x] 4.3 Run `cargo stylus check` to validate WASM deployability (treasury_vault + challenge_pool, exit 0).
- [x] 4.4 ABI: `cargo stylus export-abi` has no entrypoint in this template (no generated output); the interface is maintained manually. Updated `IChallengePool.sol` to match the new ABI — Worker must call `confirmResult` (non-payable, redeem+commission+pay) and Mini App must call `approve` on USDC before `deposit` (now ERC-20 pull, not `payable`).
- [x] 4.5 TreasuryVault accounting verified: contract passes `cargo stylus check`; deposit/redeem share math and CEI ordering reviewed in `lib.rs` (wasm-gated, no native harness available for a hosted round-trip).