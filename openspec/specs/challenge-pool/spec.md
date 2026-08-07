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