# Worker Consensus Lifecycle Specification

## Purpose

Durable, atomic per-challenge voting and confirmation-tx lifecycle in the Worker. Phases (DD-07): `collecting -> consensus -> submitting -> submitted -> confirmed | failed -> (retry) submitting`.

## Requirements

### Requirement: Atomic durable voting

Votes MUST be recorded atomically per challenge and MUST survive store/isolate re-instantiation. Exactly one vote call MUST report the consensus transition.

#### Scenario: Concurrent votes

- GIVEN a challenge in `collecting` with 5 participants
- WHEN 5 votes are submitted concurrently
- THEN all 5 votes are stored
- AND exactly one call reports the consensus trigger

#### Scenario: Persistence across instances

- GIVEN votes recorded through one store instance
- WHEN a new store instance for the same challenge reads status
- THEN the same votes and phase are returned

### Requirement: Votes frozen after consensus

Once phase leaves `collecting`, votes MUST be rejected and MUST NOT change state.

#### Scenario: Late vote

- GIVEN a challenge in `consensus` or later
- WHEN a participant votes
- THEN the vote is rejected and votes/phase are unchanged

### Requirement: Single in-flight submission

`beginSubmit` MUST be allowed only from `consensus` or `failed` and MUST atomically move to `submitting` with a lease. At most one tx MUST be in flight per challenge.

#### Scenario: Double /confirmar

- GIVEN a challenge in `consensus`
- WHEN `/confirmar` is issued twice concurrently
- THEN exactly one caller gets the submit right and one tx is sent
- AND the other receives an "already in progress" reply

#### Scenario: Lease timeout

- GIVEN a challenge in `submitting` whose lease has expired without `submitted`
- WHEN a participant retries
- THEN the phase is treated as `failed` and a new submit right is granted once

#### Scenario: Stale submitted (crash while awaiting receipt)

- GIVEN a challenge in `submitted` whose lease has expired (the holder crashed while waiting for the receipt)
- WHEN a participant retries
- THEN the phase is treated as `failed("lease_expired")` and one new submit right is granted
- AND the pre-send on-chain `challengeStatus` check prevents a double settlement

#### Scenario: Lease active

- GIVEN `submitting` with an unexpired lease
- WHEN a participant retries
- THEN no submit right is granted

### Requirement: Tx outcome and manual retry

On send success the system MUST record `submitted` with `txHash`; on receipt success `confirmed`; on send/receipt failure `failed` with `failureReason`. Retry MUST be manual only, by `/reintentar <id>` or `/confirmar` while `failed`, by any challenge participant. Before resend the system MUST check on-chain `challengeStatus`; if already settled it MUST record `confirmed` without sending.

#### Scenario: Failure then retry

- GIVEN a tx fails and phase is `failed` with a reason
- WHEN any participant sends `/reintentar` (or `/confirmar`)
- THEN exactly one tx is sent and phase becomes `submitted`, then `confirmed`

#### Scenario: Already settled on-chain

- GIVEN phase `failed` and on-chain status shows the challenge settled
- WHEN a participant retries
- THEN no tx is sent and phase becomes `confirmed`

#### Scenario: Non-participant retry

- GIVEN phase `failed`
- WHEN a non-participant sends `/reintentar`
- THEN it is rejected and phase is unchanged

### Requirement: History only after confirmation

History MUST be written only when phase becomes `confirmed`, once.

#### Scenario: Submitted or failed

- GIVEN phase `submitted` or `failed`
- THEN no history entry exists
- AND on `confirmed` exactly one entry is written

### Requirement: Status payload

Status MUST expose `phase`, `txHash` (when submitted/confirmed) and `failureReason` (when failed).

#### Scenario: Failed status

- GIVEN phase `failed`
- WHEN status is read
- THEN payload includes `phase: "failed"` and a non-empty `failureReason`
