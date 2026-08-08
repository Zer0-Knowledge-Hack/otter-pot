## MODIFIED Requirements

### Requirement: Yield realization

The system SHALL allow the administrator to accrue the yield measured from the active strategy into total assets, without minting new shares.

#### Scenario: Administrator realizes yield

- **WHEN** the administrator triggers yield realization while the active strategy reports a balance greater than the previously measured value
- **THEN** total assets increases by the positive difference between the strategy's reported balance and the previously measured value
- **THEN** total shares is unchanged

#### Scenario: No yield accrued

- **WHEN** the strategy reports the same balance as the previously measured value
- **THEN** total assets is unchanged

#### Scenario: Strategy reports a lower balance

- **WHEN** the strategy reports a balance below the previously measured value
- **THEN** total assets is not increased

### Requirement: Strategy governance

The system SHALL allow the administrator to designate which external yield strategy is active via an interchangeable adapter, to deploy and withdraw capital through it, and SHALL NOT switch strategies automatically.

#### Scenario: Administrator sets a strategy

- **WHEN** the administrator assigns a strategy adapter address
- **THEN** the strategy address is persisted for use in depositing, withdrawing and realizing yield
- **THEN** the change is emitted as a verifiable event

#### Scenario: Non-admin attempts to set a strategy

- **WHEN** a non-administrator calls set strategy
- **THEN** the system rejects the call (SDD §7.3)

## ADDED Requirements

### Requirement: Capital flows through the active strategy

The system SHALL deploy and withdraw idle USDC to and from the yield protocol only via the active strategy adapter.

#### Scenario: Administrator deploys capital

- **WHEN** the administrator deploys N USDC to the strategy
- **THEN** the system calls the active strategy's deposit with N USDC
- **THEN** the N USDC leaves idle custody but remains part of total assets

#### Scenario: Administrator withdraws capital

- **WHEN** the administrator withdraws N USDC from the strategy
- **THEN** the system calls the active strategy's withdraw and receives N USDC back into the vault

#### Scenario: Non-admin attempts to deploy or withdraw

- **WHEN** a non-administrator calls deploy to or withdraw from the strategy
- **THEN** the system rejects the call

#### Scenario: Deploy more than the idle balance

- **WHEN** the administrator attempts to deploy more USDC than the vault currently holds idle
- **THEN** the system rejects the call

#### Scenario: Redeem when idle balance is insufficient

- **WHEN** a redemption requires more USDC than the vault holds idle while capital is deployed to the strategy
- **THEN** the system first withdraws the shortfall from the active strategy
- **THEN** the caller receives the full USDC amount owed

### Requirement: Strategy migration under pause

The system SHALL allow replacing the active strategy while funds are migrated, with deposits and redemptions blocked for the duration of the pause.

#### Scenario: Migrate between strategies

- **WHEN** the administrator pauses the vault, withdraws all capital from the old strategy, sets the new strategy, and deploys the capital to it
- **THEN** the new strategy becomes active and receives the vault's USDC
- **THEN** deposit and redemption operations remain blocked until the administrator unpauses

### Requirement: Two-step ownership transfer

The system SHALL allow the administrator to transfer the admin role to another address (for example a multisig) using a two-step nomination-and-accept process.

#### Scenario: Administrator nominates a new owner

- **WHEN** the administrator nominates a new owner address
- **THEN** the current owner remains the administrator until the new owner accepts
- **THEN** the nomination is emitted as a verifiable event

#### Scenario: Nominated address accepts

- **WHEN** the nominated address accepts the nomination
- **THEN** it becomes the administrator and can perform management operations

#### Scenario: Non-nominated address attempts to accept

- **WHEN** an address other than the nominated one attempts to accept
- **THEN** the system rejects the call