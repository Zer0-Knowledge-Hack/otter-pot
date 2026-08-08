# treasury-vault Specification

## Purpose

Define el comportamiento del tesoro (TreasuryVault) como vault de participaciones sobre USDC (ERC-20). El tesoro agrega el capital USDC de todos los retos bloqueados, lo hace crecer con rendimiento medible en USDC y permite a cada reto canjear sus participaciones para recuperar su capital más el rendimiento correspondiente, de forma justa y verificable (SDD §7.1 y §7.2).
## Requirements
### Requirement: Vault share pricing

The system SHALL compute a price per share equal to total assets divided by total shares in circulation, denominated in USDC.

#### Scenario: No shares in circulation

- **WHEN** total shares is zero
- **THEN** the price per share is returned as 1 share-per-asset (1:1 initial price)

#### Scenario: Shares in circulation with accrued yield

- **WHEN** total assets increases (yield) while total shares stays constant
- **THEN** the price per share SHALL increase proportionally

### Requirement: USDC deposit minting shares

The system SHALL accept USDC deposits and mint shares to the depositor at the current price per share.

#### Scenario: First depositor

- **WHEN** the vault has no assets and a caller deposits N USDC via transfer of ERC-20 tokens from the caller
- **THEN** the system moves N USDC from the caller into the vault
- **THEN** the system mints N shares to the caller (1:1 first deposit)
- **THEN** total assets and total shares both increase by N

#### Scenario: Subsequent depositor at a higher price

- **WHEN** the price per share has increased above 1:1 and a caller deposits M USDC
- **THEN** the system moves M USDC into the vault
- **THEN** the system mints M divided by the price per share shares to the caller

### Requirement: Redeem shares for USDC

The system SHALL allow a caller to burn shares and receive the corresponding USDC (principal plus proportional yield).

#### Scenario: Redeem a subset of owned shares

- **WHEN** the caller redeems S shares
- **THEN** the system transfers to the caller the USDC amount equal to S multiplied by the price per share
- **THEN** total shares decreases by S and total assets decreases by the transferred amount

#### Scenario: Redeem more shares than available

- **WHEN** the caller attempts to redeem more shares than are in circulation
- **THEN** the system rejects the redemption

### Requirement: Admin-only management

The system SHALL restrict treasury management operations to the administrator account.

#### Scenario: Non-admin attempts a management operation

- **WHEN** a non-admin calls a management operation such as realizing yield
- **THEN** the system rejects the call

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

### Requirement: Pause protection

The system SHALL allow the administrator to pause deposits and redemptions.

#### Scenario: Paused

- **WHEN** the vault is paused
- **THEN** deposit and redemption operations are rejected

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

