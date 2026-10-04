# Worker Chain Config Specification

## Purpose

The worker MUST read chain configuration from one env-driven path (`CHAIN_*` variables) with explicit validation, and MUST NOT carry deployed addresses in versioned config.

## Requirements

### Requirement: Per-variable validation

`configDesdeEnv` MUST validate each of `CHAIN_RPC_URL`, `CHAIN_ID`, `CHALLENGE_POOL_ADDRESS`, `USDC_ADDRESS`, `OPERATOR_PRIVATE_KEY` and, when invalid or missing, return an error naming the specific variable and the problem. It MUST NOT collapse failures into a generic message or silently run the bot "without chain".

#### Scenario: Missing variable
- GIVEN `CHALLENGE_POOL_ADDRESS` is unset
- WHEN `configDesdeEnv` runs
- THEN the error names `CHALLENGE_POOL_ADDRESS` as missing

#### Scenario: Malformed address
- GIVEN `USDC_ADDRESS` is not a valid 0x 40-hex address
- WHEN `configDesdeEnv` runs
- THEN the error names `USDC_ADDRESS` as invalid

#### Scenario: Malformed private key
- GIVEN `OPERATOR_PRIVATE_KEY` does not match the 32-byte hex format
- WHEN `configDesdeEnv` runs
- THEN the error names `OPERATOR_PRIVATE_KEY` without echoing its value

#### Scenario: Valid config
- GIVEN all five variables are valid
- WHEN `configDesdeEnv` runs
- THEN a `ChainConfig` is returned

### Requirement: RPC URL validation

`CHAIN_RPC_URL` MUST parse as a URL with an `http:` or `https:` protocol; otherwise `configDesdeEnv` MUST fail naming `CHAIN_RPC_URL`.

#### Scenario: Not a URL
- GIVEN `CHAIN_RPC_URL` is `not-a-url`
- WHEN `configDesdeEnv` runs
- THEN the error names `CHAIN_RPC_URL` as an invalid URL

#### Scenario: Wrong protocol
- GIVEN `CHAIN_RPC_URL` is `ftp://host`
- WHEN `configDesdeEnv` runs
- THEN the error names `CHAIN_RPC_URL` as requiring http or https

#### Scenario: Valid https URL
- GIVEN `CHAIN_RPC_URL` is `https://sepolia-rollup.arbitrum.io/rpc`
- WHEN `configDesdeEnv` runs
- THEN the URL passes validation

### Requirement: Arbitrum Sepolia chain id

The default and documented `CHAIN_ID` MUST be `421614` in `wrangler.toml` and `.dev.vars.example`. The Arc id (`5042002`) MUST NOT remain in these files.

#### Scenario: Config files
- GIVEN `wrangler.toml` and `.dev.vars.example`
- WHEN inspected
- THEN `CHAIN_ID` is `421614` and `.dev.vars.example` holds placeholders only

### Requirement: No addresses in wrangler.toml

`wrangler.toml` MUST NOT contain any `0x` followed by 40 hex characters. Pool and USDC addresses, RPC URL and the operator key MUST be supplied via `.dev.vars` locally and `wrangler secret put` / dashboard when deployed. Deployed contract addresses MUST NOT be changed by this change.

#### Scenario: Address scan
- GIVEN `packages/worker/wrangler.toml`
- WHEN scanned with the regex `0x[0-9a-fA-F]{40}`
- THEN there are zero matches

#### Scenario: Secrets documented
- GIVEN `docs/SDD.md` and `docs/TESTING.md`
- WHEN read
- THEN they state that key and RPC are set via `wrangler secret put`

### Requirement: Single config path

The `ARBITRUM_RPC_URL` variable and its code path (`createOperatorWriter*`, `OperatorEnv`, `Env.ARBITRUM_RPC_URL`, related comments and tests) MUST be removed. All chain access MUST go through `ChainConfig` from `configDesdeEnv`.

#### Scenario: No legacy references
- GIVEN the `packages/worker` tree
- WHEN searching for `ARBITRUM_RPC_URL`
- THEN there are no matches

#### Scenario: Winner guard kept
- GIVEN `buildConfirmResultCall` and `buildAndSendConfirmResult`
- WHEN the worker tests run
- THEN their winner-guard tests still pass
