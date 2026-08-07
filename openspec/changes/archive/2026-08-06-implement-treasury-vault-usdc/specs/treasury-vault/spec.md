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

The system SHALL allow the administrator to increase total assets by a measured yield amount in USDC without minting new shares.

#### Scenario: Administrator realizes yield

- **WHEN** the administrator realizes Y USDC of yield
- **THEN** total assets increases by Y
- **THEN** total shares is unchanged

### Requirement: Strategy governance

The system SHALL allow the administrator to designate which external yield strategy is active via an interchangeable adapter, and SHALL NOT switch strategies automatically.

#### Scenario: Administrator sets a strategy

- **WHEN** the administrator assigns a strategy adapter address
- **THEN** the strategy address is persisted for use in realizing yield
- **THEN** the change is emitted as a verifiable event

### Requirement: Pause protection

The system SHALL allow the administrator to pause deposits and redemptions.

#### Scenario: Paused

- **WHEN** the vault is paused
- **THEN** deposit and redemption operations are rejected