# aave-strategy-adapter Specification

## Purpose
Defines the on-chain Aave V3 adapter contract that implements the generic IStrategy interface (`deposit`, `withdraw`, `balanceOf`, `totalAssets`) so TreasuryVault can deploy USDC to Aave without coupling its share accounting to the protocol (SDD §7.3).
## Requirements
### Requirement: IStrategy interface conformance

The adapter SHALL implement the IStrategy ABI surface (`deposit`, `withdraw`, `balanceOf`, `totalAssets`) so that TreasuryVault can call it without knowing the underlying protocol.

#### Scenario: deposit supplies USDC to Aave

- **WHEN** the designated vault calls `deposit(N)` on the adapter
- **THEN** the adapter transfers N USDC into the Aave V3 Pool via `supply(usdc, N, adapter, 0)`
- **THEN** the adapter's aUSDC balance increases proportionally

#### Scenario: withdraw redeems USDC from Aave

- **WHEN** the designated vault calls `withdraw(N)` on the adapter
- **THEN** the adapter calls `withdraw(usdc, N, adapter)` on the Aave V3 Pool
- **THEN** the adapter receives N USDC back and returns it to the vault

#### Scenario: balanceOf reports deployed value

- **WHEN** any caller reads `balanceOf`
- **THEN** it returns the current value in USDC (aUSDC balance) held by the adapter

#### Scenario: totalAssets equals deployed value

- **WHEN** any caller reads `totalAssets`
- **THEN** it returns the same value as `balanceOf`

### Requirement: Owner-only configuration

The adapter SHALL restrict initialization and configuration (including designating the vault) to its owner.

#### Scenario: Owner initializes the adapter

- **WHEN** the owner calls `init(pool, usdc, atoken)` with the Aave V3 Pool, USDC, and aUSDC addresses
- **THEN** the adapter stores the Pool and USDC addresses for later use
- **THEN** the caller becomes the owner

#### Scenario: Non-owner cannot initialize

- **WHEN** any address other than the first caller attempts to re-initialize
- **THEN** the system rejects the call

#### Scenario: Owner designates the vault

- **WHEN** the owner calls `set_vault(vault)`
- **THEN** the given address is authorized to deposit and withdraw

### Requirement: Vault-only fund movement

The adapter SHALL allow only the designated vault to move USDC in and out of Aave.

#### Scenario: Non-vault caller attempts deposit

- **WHEN** an address that is not the designated vault calls `deposit` or `withdraw`
- **THEN** the system rejects the call

