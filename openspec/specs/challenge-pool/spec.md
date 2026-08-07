# challenge-pool Specification

## Purpose

Define the behavior, states, deposits, resolution modes, and refunds for the challenge pool smart contract, ensuring secure handling of shared prize pools.

## Requirements

### Requirement: Challenge Creation

The system SHALL allow users to create a new challenge by specifying the required deposit, duration (deadline), participants, and resolution mode.

#### Scenario: User creates a challenge

- **WHEN** a user invokes challenge creation with valid parameters
- **THEN** a new challenge is created in the "Abierto" state
- **THEN** the system returns a unique identifier for the challenge

### Requirement: Deposit Acceptance

The system SHALL accept exact deposits only from registered participants for an "Abierto" challenge, denominated in USDC (ERC-20) via an approved allowance to the pool contract.

#### Scenario: Valid deposit in USDC

- **WHEN** a participant has approved the pool to move at least the required deposit and calls deposit for an "Abierto" challenge
- **THEN** the pool transfers exactly the required deposit of USDC from the participant into the pool via `transferFrom`
- **THEN** the participant's deposit is recorded
- **THEN** if all participants have deposited, the challenge transitions to the "Bloqueado" state, the full pool (total required deposits) is deposited into the `TreasuryVault` via `deposit`, and the vault-issued shares are stored as the challenge's `treasury_shares`

#### Scenario: Insufficient allowance or balance

- **WHEN** the participant's allowance or balance is insufficient to cover the required USDC deposit
- **THEN** the deposit is rejected

### Requirement: Confirm Results and Resolve

The system SHALL, when enough confirmations establish a winner for a "Bloqueado" challenge, redeem its USDC share principal from the `TreasuryVault`, receive back capital plus accrued yield, apply the dynamic commission, and transfer the remaining USDC exclusively to the winner.

#### Scenario: Consensus reached before deadline

- **WHEN** enough confirmations are recorded to establish consensus for a winner
- **THEN** the challenge transitions to "Resuelto" before any external interaction (CEI)
- **THEN** the pool redeems its `treasury_shares` from the `TreasuryVault`, receiving the corresponding USDC
- **THEN** the commission is calculated over the recovered total and applied
- **THEN** the remaining USDC is transferred to the winner, and cannot be directed to any other address

### Requirement: Refund Processing

The system SHALL, when refunding a "Bloqueado" challenge past its deadline without consensus, redeem its shares from the `TreasuryVault` and distribute the recovered USDC among the participants, without charging a commission.

#### Scenario: Deadline reached without resolution

- **WHEN** a challenge is in "Bloqueado" state and the deadline has passed without a winner
- **THEN** the challenge transitions to "Reembolsado"
- **THEN** the pool redeems its shares from the `TreasuryVault`
- **THEN** each participant receives their proportional share of the recovered USDC (principal plus yield), with no commission applied

### Requirement: Commission Rate Initialization

The system SHALL initialize the commission rate to the value provided in `init()`.

#### Scenario: Init with a commission rate

- **WHEN** the deployer calls `init` with a `baseCommissionRate`
- **THEN** the contract initializes successfully with that rate

### Requirement: Commission Rate Configurability

The system SHALL accept a new commission rate via `setCommissionRate`. The caller MUST be the contract owner.

#### Scenario: Owner sets a valid commission rate

- **WHEN** the owner calls `setCommissionRate` with a new value
- **THEN** the contract updates its stored commission rate to the new value
- **THEN** the contract emits a `CommissionRateUpdated` event containing the previous rate and the new rate

#### Scenario: Non-owner attempts to set the rate

- **WHEN** a non-owner address calls `setCommissionRate`
- **THEN** the contract reverts with `not_owner`

### Requirement: Commission Rate Readability

The system SHALL expose the current commission rate to any caller via a `commissionRate` view function, so that external consumers (Worker, scripts, Mini App) can query the active rate without parsing events.

#### Scenario: Any address reads the current commission rate

- **WHEN** any address calls `commissionRate()`
- **THEN** the contract returns the current commission rate in basis points

### Requirement: Commission Rate Mutation Traceability

The system SHALL emit a verifiable on-chain event every time the commission rate is changed, satisfying the auditability requirement (SDD §13).

#### Scenario: Commission rate is updated

- **WHEN** `setCommissionRate` succeeds
- **THEN** the contract emits a `CommissionRateUpdated(uint256 indexed previousRate, uint256 indexed newRate)` event

### Requirement: New Rate Applies to Future Resolutions Only

The system SHALL apply the commission rate stored at the moment of resolution, not the rate that was active when the challenge was created or funded.

#### Scenario: Rate changed between funding and resolution

- **WHEN** a challenge is funded at commission rate A, and the owner changes the rate to B before resolution
- **THEN** the commission on the resolved challenge is calculated using rate B