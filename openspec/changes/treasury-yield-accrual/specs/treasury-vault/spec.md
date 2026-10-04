# Delta for treasury-vault

## MODIFIED Requirements

### Requirement: Yield realization

The system SHALL automatically accrue the balance change measured from the active strategy into total assets, in both directions (yield and loss), without minting or burning shares, before every share-price-dependent operation (deposit and redeem). The administrator-only realize-yield operation SHALL remain available and SHALL perform exactly the same accrual as deposit and redeem (admin check followed by the shared accrual).

Accrual compares the strategy's reported balance with the previously measured deployed value. A positive difference increases total assets and the deployed value by that difference; a negative difference decreases total assets and the deployed value by the absolute difference. If no strategy is set, accrual is a no-op. If the strategy balance read fails or returns a short or invalid result, accrual SHALL be skipped and the previous accounting and share price SHALL be kept (no revert caused by the failed read).

#### Scenario: Fair split of unrealised yield

- **GIVEN** depositor A deposited 100 USDC and depositor B has not yet deposited
- **AND** the strategy now reports 10 USDC of unrealised yield
- **WHEN** B deposits 100 USDC
- **THEN** accrual runs before B's shares are priced, raising total assets by 10
- **AND** B is minted shares at the post-accrual price
- **WHEN** A and B each redeem all their shares
- **THEN** A receives 110 USDC and B receives 100 USDC

#### Scenario: Administrator realizes yield

- **WHEN** the administrator triggers yield realization while the strategy reports a balance greater than the previously measured value
- **THEN** total assets and the deployed value increase by the positive difference
- **AND** total shares is unchanged

#### Scenario: realize_yield reuses the shared accrual

- **WHEN** the administrator calls realize-yield
- **THEN** the system applies the same accrual logic used by deposit and redeem (yield and loss, no-strategy no-op, failed-read skip, loss event)
- **AND** a non-admin caller is rejected before any accrual occurs

#### Scenario: No change in balance

- **WHEN** the strategy reports the same balance as the previously measured value
- **THEN** total assets and the deployed value are unchanged
- **AND** no event is emitted for the accrual

#### Scenario: Strategy loss is recognised

- **GIVEN** total assets is 100, all of it deployed
- **WHEN** the strategy reports 95 and an accrual runs
- **THEN** total assets and the deployed value both decrease by 5 (to 95)
- **AND** total shares is unchanged
- **AND** a loss event carrying the loss amount (5) is emitted

#### Scenario: Loss recognised at the lowest total, last redeemer

- **GIVEN** total assets is 100 deployed, and the strategy then reports 95
- **WHEN** the last remaining share holder redeems all shares
- **THEN** the loss is accrued first and the redeemer receives 95 USDC
- **AND** the redemption does not revert

#### Scenario: Share price never drops except on recognised loss

- **WHEN** any deposit, redeem or realize-yield runs without a strategy-reported loss
- **THEN** the price per share is not lower than before the operation (floor rounding on mint and redeem MUST NOT reduce it)
- **AND** the price per share decreases only through an accrued, recognised strategy loss

#### Scenario: Failed balance read skips accrual

- **GIVEN** an active strategy whose balance read fails or returns a short result
- **WHEN** a deposit, redeem or realize-yield runs
- **THEN** accrual is skipped, total assets and the deployed value are unchanged, and the price per share is the previously stored one
- **AND** no loss event is emitted
- **AND** the failed read alone does not cause the operation to revert

#### Scenario: No strategy configured

- **WHEN** no strategy is set and a deposit, redeem or realize-yield runs
- **THEN** accrual is a no-op and behaviour is identical to the vault before this change

### Requirement: USDC deposit minting shares

The system SHALL accept USDC deposits and mint shares to the depositor at the current price per share, after accruing strategy yield or loss. Shares SHALL be minted 1:1 against assets only when total shares in circulation is zero; otherwise shares minted equal `amount * total_shares / total_assets` rounded down. A deposit that would mint zero shares SHALL be rejected.

#### Scenario: First depositor

- **WHEN** total shares is zero and a caller deposits N USDC (N greater than zero)
- **THEN** the system moves N USDC from the caller into the vault
- **AND** mints N shares to the caller (1:1)
- **AND** total assets and total shares both increase by N

#### Scenario: 1:1 minting only when total shares is zero

- **GIVEN** total shares is greater than zero (even if total assets is zero or differs from total shares)
- **WHEN** a caller deposits M USDC
- **THEN** shares are minted by the price-proportional formula, not 1:1

#### Scenario: Subsequent depositor at a higher price

- **WHEN** the post-accrual price per share is above 1:1 and a caller deposits M USDC
- **THEN** the system moves M USDC into the vault
- **AND** mints `M * total_shares / total_assets` (floored) shares to the caller

#### Scenario: Zero-share mint rejected

- **WHEN** a deposit would mint zero shares (for example an amount smaller than one share's worth, or total assets reduced to zero by loss while shares remain)
- **THEN** the system rejects the deposit
- **AND** no USDC is transferred and no state changes

### Requirement: Redeem shares for USDC

The system SHALL allow a caller to burn shares and receive the corresponding USDC (principal plus proportional yield, or minus proportional recognised loss), after accruing strategy yield or loss.

#### Scenario: Redeem a subset of owned shares

- **WHEN** the caller redeems S shares
- **THEN** accrual runs first
- **AND** the system transfers to the caller `S * total_assets / total_shares` USDC (floored) at the post-accrual price
- **AND** total shares decreases by S and total assets decreases by the transferred amount

#### Scenario: Redeem after a strategy loss

- **WHEN** a strategy loss has reduced total assets below total shares and a holder redeems
- **THEN** the holder receives the reduced, proportional amount and the redemption does not revert due to the shortfall

#### Scenario: Redeem more shares than available

- **WHEN** the caller attempts to redeem more shares than they own or than are in circulation
- **THEN** the system rejects the redemption

## ADDED Requirements

### Requirement: Loss event

The system SHALL emit an additive event when accrual recognises a strategy loss, carrying the loss amount, so that off-chain consumers can observe it. Existing events and their signatures SHALL NOT change.

#### Scenario: Loss event emitted on loss

- **WHEN** accrual recognises a loss of L USDC (L greater than zero)
- **THEN** exactly one loss event with amount L is emitted

#### Scenario: No loss event otherwise

- **WHEN** accrual observes a gain, no change, no strategy, or a failed read
- **THEN** no loss event is emitted
