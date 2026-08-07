## Purpose

Define the behavior, states, deposits, resolution modes, and refunds for the challenge pool smart contract, ensuring secure handling of shared prize pools.

## ADDED Requirements

### Requirement: Challenge Creation

The system SHALL allow users to create a new challenge by specifying the required deposit, duration (deadline), participants, and resolution mode.

#### Scenario: User creates a challenge

- **WHEN** a user invokes challenge creation with valid parameters
- **THEN** a new challenge is created in the "Abierto" state
- **THEN** the system returns a unique identifier for the challenge

### Requirement: Deposit Acceptance

The system SHALL accept exact deposits only from registered participants for an "Abierto" challenge.

#### Scenario: Valid deposit

- **WHEN** a participant sends exactly the required deposit to an "Abierto" challenge
- **THEN** the participant's deposit is recorded
- **THEN** if all participants have deposited, the challenge transitions to the "Bloqueado" state and funds are moved to the TreasuryVault

### Requirement: Confirm Results and Resolve

The system SHALL allow an authorized operator or participant to confirm the winner, and transition the challenge to "Resuelto" when consensus or judge decision is reached.

#### Scenario: Consensus reached before deadline

- **WHEN** enough confirmations are recorded to establish consensus for a winner
- **THEN** the challenge transitions to "Resuelto"
- **THEN** the treasury shares are redeemed
- **THEN** the commission is calculated and applied dynamically
- **THEN** the remaining funds are transferred to the winner

### Requirement: Refund Processing

The system SHALL allow refunds to participants if the challenge deadline is reached without consensus.

#### Scenario: Deadline reached without resolution

- **WHEN** a challenge is in "Bloqueado" state and the deadline has passed without a winner
- **THEN** the challenge transitions to "Reembolsado"
- **THEN** all participants receive their initial deposit plus their proportional share of the generated yield (no commission applied)
