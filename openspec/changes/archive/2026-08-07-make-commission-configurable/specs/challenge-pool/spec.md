## MODIFIED Requirements

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

## ADDED Requirements

### Requirement: Commission Rate Initialization

The system SHALL initialize the commission rate to the value provided in `init()`.

#### Scenario: Init with a commission rate

- **WHEN** the deployer calls `init` with a `baseCommissionRate`
- **THEN** the contract initializes successfully with that rate
