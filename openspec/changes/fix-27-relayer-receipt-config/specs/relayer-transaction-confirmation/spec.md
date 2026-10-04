# Relayer Transaction Confirmation Specification

## Purpose

The worker relayer MUST treat a challenge resolution as final only after the transaction is mined with `success` status and the contract reports `Resolved`. Basis: DD-08, `docs/TESTING.md` section 4, SDD sections 9.2 and 11.

## Requirements

### Requirement: Receipt-verified resolution

`ChainClient.confirmarResultado(challengeId, winner)` MUST send the resolution transaction, wait for its receipt, require `receipt.status === "success"`, and then re-read `challengeStatus` and require it to equal `2` (Resolved). Any failure MUST surface as a typed error. Broadcast alone MUST NOT count as success.

#### Scenario: Success receipt and Resolved status
- GIVEN a challenge ready for resolution and a chain that mines the tx with status `success`
- WHEN `confirmarResultado` runs
- THEN the receipt is awaited, `challengeStatus` is re-read and equals `2`, and the call resolves with the tx hash

#### Scenario: Reverted receipt
- GIVEN the tx is mined with `receipt.status === "reverted"`
- WHEN `confirmarResultado` runs
- THEN it rejects with a typed reverted-receipt error and does not read `challengeStatus` as success

#### Scenario: Mined success but status not Resolved
- GIVEN the receipt status is `success` but the re-read `challengeStatus` is not `2`
- WHEN `confirmarResultado` runs
- THEN it rejects with a typed not-Resolved error carrying the observed status

#### Scenario: Send or wait failure
- GIVEN the send or receipt wait throws (RPC error, timeout)
- WHEN `confirmarResultado` runs
- THEN it rejects with a typed error and never reports success

### Requirement: Serialized transactions

The client MUST route `confirmarResultado`, `crearReto` and `reembolsar` through one in-process promise queue so that sends execute one at a time, each completing (receipt received) before the next starts. A failed task MUST NOT block subsequent tasks. `crearReto` and `reembolsar` MUST also wait for the receipt and check `receipt.status`. Serialization is single-isolate best effort; cross-isolate nonce collisions are out of scope and MUST be documented.

#### Scenario: Concurrent resolutions get distinct nonces
- GIVEN two `confirmarResultado` calls for different challenges issued concurrently
- WHEN both run through the queue
- THEN the second send starts only after the first receipt is obtained, and the two txs use distinct nonces

#### Scenario: Queue survives a failure
- GIVEN the first queued task rejects
- WHEN a second task is enqueued
- THEN the second task still executes

#### Scenario: crearReto reverted
- GIVEN `crearReto` is mined with status `reverted`
- WHEN it completes
- THEN it rejects with the reverted-receipt error instead of returning success

#### Scenario: reembolsar waits for receipt
- GIVEN `reembolsar` is called
- WHEN the tx is broadcast
- THEN it waits for the receipt and rejects on `reverted`

### Requirement: Confirmation state lifecycle

`ConfirmationStore` MUST track a status per confirmation with values `enviada`, `confirmada`, `fallida`. A resolution MUST be `enviada` after broadcast, `confirmada` only after verified success, and `fallida` on any `confirmarResultado` error. On `fallida` the consensus lock (`consensusTriggeredFor`) MUST be released so a retry is allowed. Announcements and history writes MUST occur only on `confirmada`.

#### Scenario: Reverted receipt handled
- GIVEN `handleConfirmar` triggers a resolution whose receipt is reverted
- WHEN the error is caught
- THEN the user receives a message describing the reverted transaction, the state becomes `fallida`, `consensusTriggeredFor` is released, and nothing is announced or written to history

#### Scenario: Success announced
- GIVEN the resolution receipt is `success` and `challengeStatus` re-read equals `2`
- WHEN `handleConfirmar` completes
- THEN the state becomes `confirmada`, the resolution is announced, and history is written

#### Scenario: Non-Resolved status handled
- GIVEN the receipt is `success` but the challenge is not Resolved
- WHEN `handleConfirmar` handles the not-Resolved error
- THEN the state becomes `fallida`, the user receives a not-Resolved message, the lock is released, and no announcement is made

#### Scenario: Retry after failure
- GIVEN a confirmation in state `fallida`
- WHEN the user triggers confirmation again
- THEN `registerConfirmation` allows the attempt and a new transaction is sent

#### Scenario: No duplicate while in flight
- GIVEN a confirmation in state `enviada` or `confirmada`
- WHEN confirmation is triggered again for the same challenge
- THEN no new transaction is sent

### Requirement: User-facing error messages

`errores.ts` MUST map Stylus short revert codes, whether present as text or as raw ASCII revert bytes (e.g. `0x6e6f5f6f70`), to contract-error messages: `no_op`, `not_owner`, `nopart`, `dep0`, `depmax`, `pay`, `refpay`, `pull`, `vred`, `vdep`, `appr`, `noref`, `inited`, `vault0`, `notopen`, `notlocked`, `deposited`, `incdep`, `winzero`, `winpart`, `nodln`, `claimed`, `operator_is_zero`. Codes that belong only to the payout-model change (#19) MUST NOT be mapped here. It MUST provide a message for a reverted receipt and a message for a not-Resolved status. Unknown codes MUST fall back to the existing generic message.

#### Scenario: Stylus short code
- GIVEN an error containing the short code `nopart`
- WHEN `describirErrorDeContrato` runs
- THEN it returns a single neutral message (the code is emitted both for an empty roster and for a non-participant claim, so no single Solidity equivalent exists)

#### Scenario: Reverted receipt message
- GIVEN the typed reverted-receipt error
- WHEN it is described for the user
- THEN a dedicated message explaining the transaction reverted is returned

#### Scenario: Unknown code
- GIVEN an error with an unrecognized code
- WHEN described
- THEN the generic fallback message is returned

### Requirement: Parallel orchestrator path removed

`src/orchestrator.ts` and its test MUST NOT exist. `buildConfirmResultCall` and `buildAndSendConfirmResult` (winner guard) MUST remain.

#### Scenario: Dead code gone
- GIVEN the repository after the change
- WHEN searching `packages/worker` for `orchestrator` imports or `createOperatorWriter`
- THEN no references remain
