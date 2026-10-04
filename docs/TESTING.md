# Testing and Validation

How OtterPot is verified, per component. Each work item in the **ArbitrumSingapur** milestone links the sections that apply to it. Design context lives in [`DESIGN_DECISIONS.md`](DESIGN_DECISIONS.md); the roadmap in [`ROADMAP.md`](ROADMAP.md).

## 1. Principles

- Pure logic (`logic.rs`) is tested on the host; contract entry points are tested through the Stylus test harness; behavior that depends on Aave, USDC and the vault together is tested end to end on Arbitrum Sepolia.
- Every rule that protects funds has a **negative test**: the forbidden call must revert with the expected error.
- A change to a public contract function updates the ABI (`cargo stylus export-abi`) and the worker's copy in the same pull request.
- Evidence of end-to-end runs (transaction hashes and what each proves) is stored in `docs/evidence/`.

## 2. Commands

| Package | Commands |
| --- | --- |
| `packages/stylus/contracts/<contract>` | `cargo fmt` · `cargo clippy -- -D warnings` · `cargo stylus check` (also confirms the WASM stays within the size limit) · `cargo test` · `cargo stylus export-abi` |
| `packages/worker`, `packages/sweeper` | `npm run lint` · `npm test` |
| `packages/nextjs` | `yarn next:lint` · `yarn next:check-types` |
| Repository | CI runs formatting, lint and tests on every pull request to `master` |

## 3. Contracts

### 3.1 Payout (DD-01, DD-02)

Table-driven tests of `resolve_payout(recovered, pool, rate_bps)`, with `pool = 100` and `rate = 5 %`:

| Case | Recovered | Expected fee | Expected winner | Expected surplus |
| --- | --- | --- | --- | --- |
| No yield | 100 | 5 | 95 | 0 |
| Yield below target | 103 | 5 | 98 | 0 |
| Yield equals target | 105 | 5 | 100 | 0 |
| Yield above target | 108 | 5 | 100 | 3 |
| Loss | 90 | 5 | 85 | 0 |

Edge cases: rate 0, rate 10 000, recovered 0 (aborts with `norecover`). For every case: `winner ≤ pool`, `winner + fee + surplus = recovered`, no underflow or overflow. `set_fee_recipient` from a non-owner reverts with `not_owner`.

### 3.2 Roster validation (DD-03)

`create_challenge` reverts for: empty list, one participant, more than 20 participants, duplicate address, zero address, deadline not in the future. A valid three-participant challenge locks after the third deposit. `rg "unwrap\(\)"` on `challenge_pool/src/lib.rs` returns nothing.

### 3.3 Cancellation and refunds (DD-04)

- Three participants, two deposit: `cancel_challenge` returns 100 % to those two and nothing to the third.
- Reverts: cancelling a Bloqueado challenge, cancelling twice, cancelling without being an operator (`no_op`).
- `refund` on an Abierto challenge reverts before the deadline and refunds depositors after it.
- Regression: `refund` on an expired Bloqueado challenge behaves as before.
- Reentrancy: a token that re-enters during a transfer cannot collect twice (state is written before transfers).

### 3.4 Treasury yield accounting (DD-05)

Using `mock_strategy` to simulate yield and loss:

- **Fair split.** A deposits 100; the strategy earns +10 with no `realize_yield` call; B deposits 100. A redeems 110 and B redeems 100.
- **Loss.** The strategy balance drops from 100 to 95; the last redeemer receives 95 and does not revert.
- Share price never decreases except for a recognised loss.
- Without a strategy, `deposit` and `redeem_shares` behave as before.

### 3.5 Permissions (existing rules)

Redeeming shares held by another account reverts with `insufficient_shares`; `confirm_result` with a non-participant winner reverts with `winpart`; with a non-operator caller, `no_op`.

## 4. Relayer and bot

- **Concurrency.** Five simultaneous votes from different wallets produce exactly five votes and one consensus trigger.
- **Persistence.** A new store instance reads the state written by the previous one.
- **Retry.** A failed transaction moves the challenge to `failed`; the next attempt submits once and reaches `confirmed`.
- **Idempotency.** Two identical `/confirmar` commands never produce two transactions; a repeated `update_id` is ignored.
- **Receipts.** A reverted receipt makes the bot report failure and leaves the state `failed`; a successful receipt is followed by a `challengeStatus` read (Resuelto) before the announcement.
- **Configuration.** `configDesdeEnv` fails with a specific message for each missing or malformed variable; `wrangler.toml` contains no contract addresses.
- **Nonces.** Two simultaneous resolutions of different challenges use different nonces and both confirm.
- **Commands.** Router tests cover `/cancelar` permissions (creator allowed, other participant denied, group admin allowed), unknown or already locked challenges, and contract reverts translated to readable messages. `/depositar` replies with a `url` button, never `web_app`.
- The ABI in the repository matches the output of `cargo stylus export-abi`.

## 5. Sweeper

With mocked clients: paused vault skips; balance below the threshold skips the deploy but still calls `realizeYield`; sufficient balance deploys exactly `idle − totalAssets × bps / 10 000`; a failed deploy returns `FAILED`; a failed `realizeYield` is reported in the result; `validateEnv` rejects missing or malformed variables. Live: `scripts/manual-sweep.ts` produces a `supply` transaction to Aave visible on Arbiscan.

## 6. Mini App deposit page

Lint and type-check pass. On a desktop browser and on a phone: connect a wallet, switch to Arbitrum Sepolia, `approve`, `deposit`, and see the transaction on Arbiscan and the challenge state change. Depositing twice, depositing a different amount, or depositing into a closed challenge fails with a readable message.

## 7. End to end on Arbitrum Sepolia

Positive flows (each recorded in `docs/evidence/`): happy path with balances checked for winner, fee recipient and pool; cancellation of an Abierto challenge with a partial deposit; refund of an Abierto challenge past its deadline; refund of an expired Bloqueado challenge; yield through the real Aave strategy.

Negative flows (each must revert with the expected error):

| Action | Expected error |
| --- | --- |
| `confirmResult` with a non-participant winner | `winpart` |
| `confirmResult` from a non-operator | `no_op` |
| Redeeming vault shares from a foreign account | `insufficient_shares` |
| `setFeeRecipient` from a non-owner | `not_owner` |
| Depositing twice | contract rejection |
| Depositing after cancellation | contract rejection |
| Cancelling from a non-operator | `no_op` |

## 8. Demo rehearsal

The six-step demo from [`ROADMAP.md`](ROADMAP.md) §1 runs twice in a row without manual intervention. Each step has a backup transaction hash in `docs/evidence/`.
