## 1. Pure Logic and Invariant Tests

- [x] 1.1 Implement `resolve_payout(recovered: U256, pool: U256, rate_bps: U256) -> (U256, U256, U256)` in `logic.rs` according to DD-01 formulas
- [x] 1.2 Implement unit tests in `logic.rs` for the DD-01 table (yield 0, 3, 5, 8 with pool 100 and rate 5%, and loss conditions)
- [x] 1.3 Implement invariant and boundary tests in `logic.rs` (`winner <= pool`, `winner + fee + surplus == recovered`, zero recovered, zero rate, max rate 10_000)

## 2. Storage, Events, and Admin Setters

- [x] 2.1 Add `fee_recipient: StorageAddress` to `ChallengePool` struct and initialize to `msg::sender()` in `init`
- [x] 2.2 Define `FeeRecipientUpdated(address indexed previous_recipient, address indexed new_recipient)` event
- [x] 2.3 Implement owner-only `set_fee_recipient` and public view `fee_recipient()`
- [x] 2.4 Add `MAX_COMMISSION_BPS = 1000` cap check in `set_commission_rate` (revert with `ratemax` if exceeded)

## 3. Resolution Execution and Payout Transfers

- [x] 3.1 Update `confirm_result` in `lib.rs` to validate `recovered > 0`, reverting with `norecover` if `recovered == 0`
- [x] 3.2 Ensure CEI order in `confirm_result`: state set to `STATE_RESUELTO` before external calls/transfers
- [x] 3.3 Transfer `winner` payout to winner address, and `fee + surplus` to `fee_recipient`
- [x] 3.4 Update `ChallengeResolved` event definition and emission to include `surplus`

## 4. Verification and Stylus Validation

- [x] 4.1 Run `cargo test` across the workspace and verify all tests pass
- [x] 4.2 Run `cargo stylus check` to confirm WASM validity and log WASM size
