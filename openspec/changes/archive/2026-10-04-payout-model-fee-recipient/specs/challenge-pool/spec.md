## MODIFIED Requirements

### Requirement: Confirm Results and Resolve

The system SHALL, when enough confirmations establish a winner for a "Bloqueado" challenge, redeem its USDC share principal from the `TreasuryVault`, receive back capital plus accrued yield, calculate the payout according to DD-01, transfer the winner payout exclusively to the winner, and transfer the platform fee and surplus to the designated `fee_recipient`.

#### Scenario: Consensus reached before deadline
- **WHEN** enough confirmations are recorded to establish consensus for a winner
- **THEN** the challenge transitions to "Resuelto" before any external interaction (CEI)
- **THEN** the pool redeems its `treasury_shares` from the `TreasuryVault`, receiving the corresponding USDC
- **THEN** if the recovered assets equal zero, the transaction reverts with `norecover`
- **THEN** the payout is resolved such that fee is min(target_commission, recovered), winner payout is min(pool, recovered - fee), and surplus is recovered - fee - winner
- **THEN** the winner payout is transferred to the winner address
- **THEN** the sum of fee and surplus is transferred to `fee_recipient`
- **THEN** the contract emits `ChallengeResolved(challenge_id, winner, total_payout, commission, surplus)`

#### Scenario: Treasury vault redemption returns zero assets
- **WHEN** the pool redeems shares from the `TreasuryVault` and 0 USDC is returned
- **THEN** the transaction reverts with `norecover`
- **THEN** the challenge is not marked as resolved and no transfers occur

### Requirement: Commission Rate Configurability

The system SHALL accept a new commission rate via `set_commission_rate`. The caller MUST be the contract owner and the rate MUST NOT exceed the safety cap of 1000 basis points (10%).

#### Scenario: Owner sets a valid commission rate
- **WHEN** the owner calls `set_commission_rate` with a rate <= 1000 basis points
- **THEN** the contract updates its stored commission rate to the new value
- **THEN** the contract emits a `CommissionRateUpdated` event containing the previous rate and the new rate

#### Scenario: Owner attempts to set a rate exceeding the safety cap
- **WHEN** the owner calls `set_commission_rate` with a rate > 1000 basis points
- **THEN** the contract reverts with an error indicating the rate exceeds the maximum cap

#### Scenario: Non-owner attempts to set the rate
- **WHEN** a non-owner address calls `set_commission_rate`
- **THEN** the contract reverts with `not_owner`

## ADDED Requirements

### Requirement: Fee Recipient Management

The system SHALL maintain a `fee_recipient` address to receive platform fees and surplus yield from resolved challenges, initializing to the contract deployer/owner and configurable exclusively by the owner.

#### Scenario: Initial fee recipient set on init
- **WHEN** `init` is executed
- **THEN** `fee_recipient` is initialized to `msg::sender()`

#### Scenario: Owner updates fee recipient to a valid address
- **WHEN** the owner calls `set_fee_recipient` with a non-zero address
- **THEN** `fee_recipient` is updated to the new address
- **THEN** the contract emits `FeeRecipientUpdated(previous_recipient, new_recipient)`

#### Scenario: Setting fee recipient to zero address
- **WHEN** the owner calls `set_fee_recipient` with the zero address
- **THEN** the transaction reverts

#### Scenario: Non-owner attempts to set fee recipient
- **WHEN** a non-owner address calls `set_fee_recipient`
- **THEN** the transaction reverts with `not_owner`

#### Scenario: Querying fee recipient
- **WHEN** any caller calls `fee_recipient()`
- **THEN** the contract returns the current `fee_recipient` address

### Requirement: Payout Invariant Enforcement

The system SHALL guarantee that for any resolution payout calculation: the winner payout never exceeds the original pool (`winner <= pool`), and the sum of winner payout, fee, and surplus strictly equals the total recovered assets (`winner + fee + surplus == recovered`).

#### Scenario: Normal resolution with positive yield
- **WHEN** recovered assets exceed the target pool
- **THEN** target fee is paid from yield, winner receives exactly the full pool amount, and any remaining yield is routed as surplus to the fee recipient
- **THEN** `winner <= pool` and `winner + fee + surplus == recovered`

#### Scenario: Resolution with zero yield or principal shortfall
- **WHEN** recovered assets are less than or equal to the target pool
- **THEN** fee is capped at recovered assets, winner receives `min(pool, recovered - fee)`, surplus is zero
- **THEN** `winner <= pool` and `winner + fee + surplus == recovered`
