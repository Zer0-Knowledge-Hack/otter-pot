## 1. Setup & Data Structures

- [x] 1.1 Create `Challenge` struct with fields: creator, required_deposit, deadline, status, winner, treasury_shares, etc.
- [x] 1.2 Define enums for `ChallengeState` (Abierto, Bloqueado, Resuelto, Reembolsado).
- [x] 1.3 Set up storage in the main `ChallengePool` struct for challenges (mapping) and global configurations (treasury vault address, operator roles, base commission rate).

## 2. Core Challenge Lifecycle

- [x] 2.1 Implement `create_challenge`: initialize a new challenge with state "Abierto" and store participant mapping.
- [x] 2.2 Implement `deposit`: validate exact amount from registered participant, update their deposit status.
- [x] 2.3 Implement logic in `deposit` to transition to "Bloqueado" when all participants have deposited, emitting the correct event.

## 3. Resolution and Refunds

- [x] 3.1 Implement `confirm_result`: record the winner and transition to "Resuelto" when consensus is reached.
- [x] 3.2 Implement commission calculation and fund transfer inside `confirm_result`/resolution, redeeming treasury shares first.
- [x] 3.3 Implement `refund` for challenges past deadline without consensus: calculate proportional return (principal + yield) without commission, returning funds to each participant. State becomes "Reembolsado".

## 4. Security & Testing

- [x] 4.1 Apply strict Checks-Effects-Interactions pattern across all state-mutating functions.
- [x] 4.2 Use `test-driven-development` skill to write tests verifying the states and state transitions (e.g., cannot deposit twice, cannot resolve if not in Bloqueado).
- [x] 4.3 Use `rust-audit` skill to review the code.
