## Context

OtterPot moves USDC (ERC-20) on Arbitrum. `TreasuryVault` (SDD §7) aggregates the capital of all locked challenges and places it in an external yield strategy, distributing yield fairly via participation accounting (§7.2). `ChallengePool` custodies each challenge and interacts with the vault to redeem its shares when resolving/refunding.

Current state: `TreasuryVault` already keeps the participation accounting (pricing, `deposit`, `redeem_shares`, `realize_yield`) but only mutates internal storage without moving real USDC (its `deposit`/`redeem_shares` explicitly defer the ERC-20 transfer to production). `ChallengePool` is not integrated: in `deposit`/`confirm_result`/`refund` (packages/stylus/contracts/challenge_pool/src/lib.rs) it simulates shares 1:1 and uses `mock_yield()` from `logic.rs`. This change delivers real USDC movement in the vault and wires `ChallengePool` to redeem shares on resolve/refund.

## Goals / Non-Goals

**Goals:**

- Move real USDC (ERC-20) in `TreasuryVault`: `deposit` pulls via `IERC20.transferFrom`, `redeem_shares` pays out via `IERC20.transfer`.
- Integrate `ChallengePool`: when locked, deposit the USDC pool into the vault and store the received shares; when resolving/refunding, redeem those shares to recover USDC (capital + yield) and settle payouts.
- Switch the deposit flow to USDC via `approve`/`transferFrom`, removing the reliance on `msg.value` / native currency.
- Preserve the Checks-Effects-Interactions pattern and the SDD §11 / §7.3 security rules.

**Non-Goals:**

- Deploying to a network (only `cargo stylus check` / `cargo test`).
- Implementing a concrete external yield protocol; the strategy adapter stays an interface and `realize_yield` remains the MVP entry point for measurable USDC yield (SDD §7.3, §7.4).
- Off-ramp to fiat (SDD §12 leaves it to the user).

## Decisions

1. **Minimal ERC-20 interface**: use `alloy_sol_types::sol!` to declare `IERC20 { transferFrom, transfer, approve, balanceOf }`. USDC exists in variants that do and do not return `bool`, so the vault must not require a `bool` return; verify via `balanceOf` deltas or accept both conventions.
   *Rationale*: a naive `require(retval == true)` against a non-conforming token would break transfers; verifying amounts instead keeps it compatible.
2. **Vault `deposit` pulls USDC**: the caller first `approve`s the vault; `deposit` computes shares, writes accounting effects (CEI), then calls `IERC20.transferFrom`. Errors bubble as `Vec<u8>` rather than `unwrap()`.
3. **Vault `redeem_shares` pays out**: burns shares and updates `total_assets`/`total_shares` before any external transfer, then calls `IERC20.transfer(to, assets)`. `to` is a parameter (called by the ChallengePool as the pool itself).
4. **`ChallengePool.deposit` becomes ERC-20**: uses `transferFrom(participant, pool, required_deposit)` instead of `msg.value`. When all participants have funded, the pool calls `vault.deposit(total_pool)` and stores the returned shares as `treasury_shares`.
5. **`treasury_shares` semantics**: it becomes the count of vault shares held by the pool (not the dollar pool amount). `confirm_result`/`refund` call `vault.redeem_shares(treasury_shares)` and use the recovered USDC for payout/refund.
6. **Remove `mock_yield` from the resolution path**: `resolve_payout` now receives the recovered USDC total and computes commission = `total * rate_bps / 10_000`, payout = `total - commission`. Refunds keep no-commission proportional split using `refund_per_participant`.
7. **Keep `realize_yield` + strategy governance**: `realize_yield` remains the admin-only way to grow `total_assets`; `set_strategy` stays admin-only and does not auto-switch (SDD §7.3).

## Risks / Trade-offs

- **[Risk] Non-conforming USDC return values**: mitigated by amount verification / not requiring `bool` return.
- **[Risk] Reentrancy during token transfers**: mitigated by strict CEI (mark Resuelto/Reembolsado and burn shares before any external call), reusing existing pool guards.
- **[Risk] Insufficient allowance/balance on deposit**: the Mini App must `approve` USDC to the pool before `deposit`; the contract reverts with a clear error otherwise.
- **[Risk] Unauthorized strategy change**: `set_strategy` guarded by `require_admin` multi-sig (SDD §7.3).
- **[Trade-off] Economic yield is not material within the hackathon window** (SDD §7.4); the goal is correct accounting and architecture, not measurable returns.