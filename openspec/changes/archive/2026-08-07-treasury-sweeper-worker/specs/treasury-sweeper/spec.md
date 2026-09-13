## Purpose

Defines the behavior of the automated treasury sweep service that moves idle USDC from TreasuryVault into the active yield strategy on a recurring schedule, without human intervention.

## ADDED Requirements

### Requirement: Scheduled sweep trigger

The system SHALL execute the sweep logic automatically on a recurring schedule defined by a cron expression, without requiring manual invocation or an HTTP endpoint.

#### Scenario: Cron fires on schedule

- **WHEN** the configured cron trigger fires
- **THEN** the system evaluates whether a sweep is needed and executes it if conditions are met

#### Scenario: No HTTP route exposed

- **WHEN** an external client attempts to reach the sweeper via HTTP
- **THEN** the system does not accept or process the request (no fetch handler)

### Requirement: Threshold-gated deployment

The system SHALL deploy idle USDC to the active yield strategy only when the idle balance meets or exceeds a configurable minimum threshold.

#### Scenario: Idle balance above threshold

- **WHEN** the idle USDC balance in TreasuryVault is greater than or equal to the configured threshold
- **THEN** the system calls `deployToStrategy` with the full idle balance

#### Scenario: Idle balance below threshold

- **WHEN** the idle USDC balance in TreasuryVault is less than the configured threshold
- **THEN** the system does not call `deployToStrategy`
- **THEN** the system logs that the sweep was skipped due to insufficient idle balance

#### Scenario: Idle balance is zero

- **WHEN** the idle USDC balance in TreasuryVault is zero
- **THEN** the system does not call `deployToStrategy`

### Requirement: Yield realization after deployment

The system SHALL call `realizeYield` on TreasuryVault after a successful deployment to update the vault's internal accounting.

#### Scenario: Successful deployment followed by yield realization

- **WHEN** `deployToStrategy` succeeds
- **THEN** the system calls `realizeYield` to synchronize the vault's `strategyDeployed` with the strategy's actual balance

#### Scenario: Deployment fails

- **WHEN** `deployToStrategy` reverts or fails
- **THEN** the system does not call `realizeYield`
- **THEN** the system logs the failure with the error details

### Requirement: Vault pause awareness

The system SHALL not attempt any operation when TreasuryVault is paused.

#### Scenario: Vault is paused

- **WHEN** the cron trigger fires and `TreasuryVault.paused()` returns true
- **THEN** the system skips the sweep entirely
- **THEN** the system logs that the vault is paused

### Requirement: Admin key isolation

The system SHALL use a private key that is separate from the bot Worker's operator key, stored as a Cloudflare Worker secret, and never exposed via HTTP or logs.

#### Scenario: Key stored as secret

- **WHEN** the sweeper Worker is deployed
- **THEN** the admin private key is stored via `wrangler secret` and is not present in source code, environment variables files, or `wrangler.toml`

### Requirement: Operational observability

The system SHALL log the outcome of every sweep cycle with sufficient detail for debugging and auditing.

#### Scenario: Sweep executed

- **WHEN** a sweep deploys capital to the strategy
- **THEN** the system logs the idle balance before, the amount deployed, the transaction hash, and the updated `strategyDeployed` value

#### Scenario: Sweep skipped

- **WHEN** a sweep is skipped for any reason (below threshold, paused, zero balance)
- **THEN** the system logs the reason for skipping and the current idle balance

#### Scenario: Sweep failed

- **WHEN** a sweep transaction fails
- **THEN** the system logs the error message, the attempted amount, and any transaction details available
