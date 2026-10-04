# Design Decisions

Decision log for the current iteration ("v8") of OtterPot. [`SDD.md`](SDD.md) remains the source of truth for the product. SDD v8 incorporates DD-01 to DD-10 as the target behavior; its section 17 tracks which of them are implemented and which are pending. Work items are tracked in the **ArbitrumSingapur** milestone; see [`ROADMAP.md`](ROADMAP.md).

Each entry states the context, the decision, its consequences and how it is verified (see [`TESTING.md`](TESTING.md)).

| ID | Decision | Component | Work item |
| --- | --- | --- | --- |
| DD-01 | Payout model and invariants | `ChallengePool` | #19 |
| DD-02 | Fee recipient | `ChallengePool` | #19 |
| DD-03 | Roster validation at creation | `ChallengePool` | #20 |
| DD-04 | Cancellation and Open-state refunds | `ChallengePool` | #21 |
| DD-05 | Yield accounting at deposit and redeem | `TreasuryVault` | #22 |
| DD-06 | Sweeper policy | Sweeper | #30 |
| DD-07 | Persistent consensus and transaction lifecycle | Relayer | #26 |
| DD-08 | Relayer reliability and configuration | Relayer | #27 |
| DD-09 | Single coordinated redeployment | All | #24 |
| DD-10 | Deposit flow from Telegram groups | Bot, Mini App | #31, #32 |

---

## DD-01 — Payout model and invariants

**Status:** Accepted.

Team decision: A. Keep the current model: fee = min(target, recovered), winner = min(pool, recovered − fee). The winner can receive less than the pool. Pitch / README / #9 must not claim no-loss or “the pot never shrinks”.

**Context.** SDD v7 §8.2 specified that yield earned by a challenge is applied to its commission first and that the winner never receives more than the pool. The current `resolve_payout` applies the commission rate to the *recovered* amount (principal plus yield) and pays the winner the remainder, so yield can raise the winner's payout above the pool. The SDD formula `fee = max(target − yield, 0)` also leaves the platform with no fee whenever yield covers the commission.

**Decision.** The platform always receives the target commission. Yield funds it first; participants only cover the shortfall. Anything left after the winner and the fee are paid is the *surplus*, which is sent to the fee recipient.

The commission percentage is configurable and not hardcoded: `set_commission_rate(rate_bps)` allows the owner to adjust it up to a maximum safety ceiling (`MAX_COMMISSION_BPS = 1000` bps / 10 %), protected by access control (`only_owner`) and emitting `CommissionRateUpdated(previous_rate, new_rate)` to prevent owner griefing and maintain on-chain auditability.

```
pool      = deposit × participants
target    = pool × rate_bps / 10 000
fee       = min(target, recovered)
winner    = min(pool, recovered − fee)
surplus   = recovered − fee − winner          → fee recipient
```

Worked example, `pool = 100`, `rate = 5 %` (`target = 5`):

| Yield | Recovered | Fee | Winner | Surplus |
| --- | --- | --- | --- | --- |
| 0 | 100 | 5 | 95 | 0 |
| 3 | 103 | 5 | 98 | 0 |
| 5 | 105 | 5 | 100 | 0 |
| 8 | 108 | 5 | 100 | 3 |
| loss (−10) | 90 | 5 | 85 | 0 |

**Invariants.** `winner ≤ pool` and `winner + fee + surplus = recovered` for every input. A redemption that returns `0` aborts the resolution instead of marking the challenge Resuelto with a zero payout.

**Consequences.** Participants never gain or lose more than the target commission. Platform revenue is `max(target, yield)` per resolved challenge. The `ChallengeResolved` event exposes `winner`, `fee` and `surplus`. The platform fee is configurable by the owner within strict safety limits (`rate_bps ≤ 1000`). Pitch, README and demo materials must not claim "no-loss" or "the pot never shrinks", as the winner receives less than the pool when yield is insufficient to cover the fee.

**Verified by.** Payout invariant tests in `challenge_pool/src/logic.rs` and rate bounds tests (TESTING §3.1).

## DD-02 — Fee recipient

**Status:** Accepted.

**Context.** The commission is calculated but never leaves `ChallengePool`; it sits in the pool next to participant funds.

**Decision.** `ChallengePool` stores a `fee_recipient` (default: the owner set in `init`). Only the owner can change it with `set_fee_recipient`, which emits `FeeRecipientUpdated(previous, new)`. `confirm_result` transfers the fee and the surplus to it in the same transaction that pays the winner. The only transfers a resolution can make are to the winner and the fee recipient; an operator cannot choose either destination.

**Consequences.** The pool balance contains participant funds only. Platform revenue is readable as `USDC.balanceOf(feeRecipient)` and auditable from `ChallengeResolved` events.

**Verified by.** TESTING §3.1 and the end-to-end flow (TESTING §7).

## DD-03 — Roster validation at creation

**Status:** Accepted.

**Context.** `create_challenge` stores `participant_count` as the length of the submitted list. A repeated address makes the count unreachable, so the challenge can never lock. It also accepts a deadline in the past and a single participant, and four `unwrap()` calls remain on paths that handle funds.

**Decision.** `create_challenge` rejects duplicate addresses, the zero address, fewer than 2 or more than 20 participants, and any `deadline` that is not in the future. The participant list is also stored as an iterable `StorageVec<Address>` (needed by DD-04). The `unwrap()` calls on fund paths are replaced by explicit error propagation, as required by `AGENTS.md`.

**Consequences.** A challenge that can never lock cannot be created. The 20-participant cap bounds the gas cost of the duplicate scan and of cancellation.

**Verified by.** TESTING §3.2.

## DD-04 — Cancellation and Open-state refunds

**Status:** Accepted.

**Context.** [`SDD.md`](SDD.md) §6.3 and §6.5 specify that a challenge in the Abierto state can be cancelled and that partial deposits are never trapped. Today `refund` requires the Bloqueado state, so partial deposits in an Abierto challenge have no exit.

**Decision.**

- `cancel_challenge(id)`: operator only, state Abierto only. It refunds `required_deposit` to each participant that already deposited and to nobody else. The state is set to Reembolsado **before** any transfer. Cancellation is distinguished from expiry by the `ChallengeCancelled` event.
- `refund(id)` also accepts an Abierto challenge whose deadline has passed (permissionless safety net).
- The Bloqueado refund path is unchanged.

The on-chain creator is the operator account, so the right of the human creator (or a group admin) to cancel is verified by the bot before the operator relays the call. The contract never lets the operator choose the destination or the amount.

**Verified by.** TESTING §3.3.

## DD-05 — Yield accounting at deposit and redeem

**Status:** Accepted.

**Context.** [`SDD.md`](SDD.md) §7.2 promises that each challenge earns only the yield of its own capital and time. Yield is currently credited only when the admin calls `realize_yield`. A challenge that deposits after Aave has accrued yield, but before the next call, buys shares at a stale price and captures part of the earlier challenge's yield. Losses in the strategy are never recognised, so `total_assets` can exceed what the strategy holds.

**Decision.** `TreasuryVault` runs an internal accrual at the start of `deposit` and `redeem_shares`: it compares the strategy balance with `strategy_deployed` and updates `total_assets` and `strategy_deployed`, **up or down**. `realize_yield` remains as a manual entry point to the same routine. With no strategy configured the accrual is a no-op.

Example: challenge A deposits 100; the strategy earns 10; challenge B deposits 100. The accrual lifts the share price to 1.10 before B's shares are minted, so A redeems 110 and B redeems 100.

**Consequences.** Share price is correct at every operation without depending on the cron. The vault is redeployed (DD-09).

**Verified by.** TESTING §3.4.

## DD-06 — Sweeper policy

**Status:** Accepted.

**Context.** [`SDD.md`](SDD.md) §9.1 describes the Sweeper as a cron worker that moves idle funds to the strategy. The idle balance in the vault is the liquidity used for fast refunds and withdrawals.

**Decision.**

- **Liquidity buffer.** The Sweeper keeps at least `SWEEP_BUFFER_BPS` (default 2000, i.e. 20 %) of the vault's total assets idle: `deploy = max(0, idle − totalAssets × bps / 10 000)`.
- **Yield on every run.** `realizeYield` is called on every execution, including when the deploy is skipped.
- **Truthful results.** The result states are `SKIPPED_PAUSED`, `SKIPPED_BELOW_THRESHOLD`, `DEPLOYED` and `FAILED`. `DEPLOYED` is reported only when the deploy transaction is confirmed.
- **Configuration.** Contract addresses and keys are environment variables or secrets; none live in `wrangler.toml`.

**Verified by.** TESTING §5.

## DD-07 — Persistent consensus and transaction lifecycle

**Status:** Accepted.

**Context.** Votes are held in a module-level in-memory store, but Cloudflare Workers run several isolates and restart them, so votes can be lost. Consensus is also recorded before the on-chain transaction is sent, so a failed transaction leaves the challenge unable to retry.

**Decision.** The confirmation store is a **Durable Object per challenge**, which gives a single writer and atomic read-modify-write. Each challenge follows an explicit lifecycle:

```
collecting → consensus → submitting(lease) → submitted(txHash) → confirmed
                                  │                  │
                                  └────────→ failed(reason) → (manual retry) → submitting
```

`submitting` is the lease phase: the right to send is granted atomically with a monotonic attempt number and a lease (180 s), renewed when the tx is broadcast. A `submitting` or `submitted` phase whose lease expired is treated as `failed("lease_expired")`, so a crashed holder is recoverable without an admin. Stale attempts are fenced: marks carrying an old attempt number are rejected. Before every send the Worker reads `challengeStatus`; an already resolved challenge becomes `confirmed` without sending.

At most one transaction is in flight per challenge, and a failed transaction returns the challenge to a retryable state. Retry is manual (`/reintentar`, or `/confirmar` while `failed`) and open to any participant. History is written only on the first confirmation. Telegram updates are deduplicated by `update_id` per chat (a Durable Object with a 200-id FIFO window, failing open).

**Consequences.** Votes survive restarts and concurrent voters cannot overwrite each other. KV is not used for votes because of its eventual consistency.

**Verified by.** TESTING §4.

## DD-08 — Relayer reliability and configuration

**Status:** Accepted.

**Context.** The confirmation flow announces success when the transaction is broadcast, not when it is mined. Two separate configurations select the chain (`ARBITRUM_RPC_URL` and `CHAIN_RPC_URL`), and `wrangler.toml` contains contract addresses. A single operator key signs from a stateless worker, so two simultaneous resolutions can reuse a nonce.

**Decision.**

- After sending `confirmResult` the relayer waits for the receipt, checks `status === "success"` and re-reads `challengeStatus` (Resuelto) before announcing the result.
- One `ChainConfig` (`CHAIN_ID`, `CHAIN_RPC_URL`, `CHALLENGE_POOL_ADDRESS`, `USDC_ADDRESS`, `OPERATOR_PRIVATE_KEY`) drives both challenge creation and confirmation. Addresses are environment variables; keys and the RPC URL are secrets.
- Operator transactions are serialized so concurrent resolutions get distinct nonces.
- The operator account and the admin account used by the Sweeper and the vault are different accounts.

**Verified by.** TESTING §4.

## DD-09 — Single coordinated redeployment

**Status:** Accepted.

**Context.** `ChallengePool` and `TreasuryVault` are not upgradeable and their storage layout changes in this iteration. Each redeployment forces updates in the worker, sweeper, Mini App and scripts.

**Decision.** All contract changes ship together. Order of operations on Arbitrum Sepolia:

1. Withdraw the position of the previous vault from Aave.
2. Deploy `TreasuryVault`, then `AaveV3Strategy.setVault(vault)` and `vault.setStrategy(strategy)`.
3. Deploy `ChallengePool` with `init(vault, usdc, rate)`; then `addOperator` and `setFeeRecipient`.
4. Export the ABI (`cargo stylus export-abi`) and copy it to `packages/worker/contracts`.
5. Verify the three contracts on Arbiscan and update `AddressContracts.json` and the environment variables of the worker, sweeper and Mini App.

**Verified by.** `scripts/verify-contracts.ts` and TESTING §7.

## DD-10 — Deposit flow from Telegram groups

**Status:** Accepted.

**Context.** Telegram `web_app` buttons only work in private chats ([`BOT.md`](BOT.md) §9). Deposits require the participant's own signature, so the bot cannot deposit on their behalf.

**Decision.** `/depositar <id>` replies with a `url` button that opens the deposit page (`packages/nextjs/app/depositar`) with the challenge id and amount. The page reads the challenge state from the chain, reads the token decimals from the token contract, and requests two signatures (`approve`, `deposit`) from the participant's wallet on Arbitrum Sepolia. The page talks to the chain directly and trusts nothing from the backend. A `t.me/<bot>/<app>?startapp=<id>` deep link can replace the plain URL once the Mini App is registered with @BotFather.

**Consequences.** Deposits never depend on the relayer. Mobile wallet support is part of the deposit page work (#31).

**Verified by.** TESTING §6.
