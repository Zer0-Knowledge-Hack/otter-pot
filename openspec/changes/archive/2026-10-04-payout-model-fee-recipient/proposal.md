# Change Proposal: Payout Model according to SDD and Fee Recipient

## Why

The current payout logic in `ChallengePool` (`logic.rs`) calculates commission on the total recovered assets rather than against the target pool size, allowing yield to increase the winner's payout above the pool and leaving the platform with zero commission under certain conditions. Furthermore, collected commissions currently remain locked in the pool contract rather than being routed to a dedicated treasury address, and resolution on zero recovered assets erroneously marks challenges as resolved.

Aligning `ChallengePool` with `docs/DESIGN_DECISIONS.md` (DD-01 and DD-02) and `docs/SDD.md` §8.2 ensures that:
1. The platform receives its target fee from yield first, participants only cover shortfalls, and surplus yield goes to the fee recipient.
2. The winner payout never exceeds the original pool principal (`winner <= pool`).
3. Fees and surplus are automatically transferred to a configurable `fee_recipient`.
4. Challenges with zero recovered assets from the vault are rejected (`norecover`).

## What Changes

- **BREAKING**: Replaced `resolve_payout(recovered_assets, commission_rate_bps) -> (U256, U256)` with `resolve_payout(recovered: U256, pool: U256, rate_bps: U256) -> (U256, U256, U256)` returning `(winner, fee, surplus)`.
- **BREAKING**: Updated `ChallengeResolved` event signature to emit `(challenge_id, winner, total_payout, commission, surplus)`.
- Added contract storage `fee_recipient: StorageAddress` initialized to `msg::sender()` in `init()`.
- Added owner-only `set_fee_recipient(new_recipient: Address)` function and `FeeRecipientUpdated` event.
- Added public view function `fee_recipient() -> Address`.
- Added commission cap check in `set_commission_rate`: reverts if `rate_bps > 1000` (10% max cap per DD-01).
- Updated `confirm_result` to:
  - Reject with `norecover` if `recovered` from vault is zero.
  - Set terminal state `STATE_RESUELTO` before external transfers (CEI).
  - Transfer `winner` payout to the winner address.
  - Transfer `fee + surplus` to `fee_recipient`.
  - Emit updated `ChallengeResolved` event with `total_payout`, `commission`, and `surplus`.

## Capabilities

### Modified Capabilities
- `challenge-pool`: Update payout resolution logic to implement DD-01 formulas, add `fee_recipient` management, enforce rate ceiling, and route fee/surplus on challenge resolution.

## Impact

- **Contracts (`packages/stylus/contracts/challenge_pool`)**:
  - `src/logic.rs`: New `resolve_payout` signature and math implementing DD-01 with comprehensive unit tests for invariants.
  - `src/lib.rs`: Storage update, `FeeRecipientUpdated` event, `set_fee_recipient`, updated `set_commission_rate`, updated `confirm_result` CEI and transfers.
- **ABI & Integration**:
  - ABI changes in `ChallengePool` requiring `cargo stylus export-abi` update in subsequent deployment tasks.
  - Affects downstream relayer / worker event parsing for `ChallengeResolved`.
