## Context

See `proposal.md` for motivation. The existing `ChallengePool` smart contract manages funds across lifecycle states (`Abierto`, `Bloqueado`, `Resuelto`, `Reembolsado`). In the current implementation, `logic::resolve_payout` calculates commission over total recovered assets, allowing winner payout to exceed the original pool and failing to transfer fees out of the contract.

## Goals / Non-Goals

**Goals:**
- Implement the exact mathematical formula defined in DD-01:
  - `target = pool * rate_bps / 10_000`
  - `fee = min(target, recovered)`
  - `winner = min(pool, recovered - fee)`
  - `surplus = recovered - fee - winner`
- Invariants: `winner <= pool` and `winner + fee + surplus == recovered`.
- Introduce `fee_recipient: StorageAddress` and its setter with access control (`only_owner`), view function, and event.
- Ensure `confirm_result` executes transfers to `winner` and `fee_recipient` (`fee + surplus`) after setting state to `STATE_RESUELTO` (CEI pattern).
- Revert with `b"norecover"` when `recovered == 0`.
- Cap commission rate in `set_commission_rate` to `MAX_COMMISSION_BPS = 1000` (10%).

**Non-Goals:**
- Upgradability / proxy implementation (contracts are immutable; redeployment is coordinated under issue #24).
- Modifications to `TreasuryVault` or `AaveV3Strategy` (tracked under issue #22).
- Cancellation / Open-state refunds (tracked under issue #21 / DD-04).
- Roster validation (tracked under issue #20 / DD-03).

## Decisions

### Decision 1: Pure Function Math in `logic.rs`
- **Choice**: Implement `pub fn resolve_payout(recovered: U256, pool: U256, rate_bps: U256) -> (U256, U256, U256)` in `logic.rs`.
- **Rationale**: Isolates math from EVM state, allowing fast unit testing of invariants and boundary tables (e.g. DD-01 worked examples, zero recovered, rate extremes, loss conditions) on native Rust (`cargo test`).
- **Alternative considered**: Inlining math into `confirm_result`. Rejected because it increases WASM bloat and impairs testability.

### Decision 2: Combined Fee & Surplus Transfer
- **Choice**: In `confirm_result`, if `fee + surplus > 0`, transfer the combined amount to `fee_recipient` via a single ERC-20 transfer.
- **Rationale**: Minimizes gas overhead by consolidating the two platform revenue components destined for the same address into one EVM call, while retaining granular visibility in the `ChallengeResolved` event.

### Decision 3: Enforcing Rate Ceiling in `set_commission_rate`
- **Choice**: Add `pub const MAX_COMMISSION_BPS: u64 = 1000;` and validate `rate_bps <= U256::from(MAX_COMMISSION_BPS)`.
- **Rationale**: Directly enforces DD-01 and prevents accidental or malicious owner griefing (reverting with `b"ratemax"`).

### Decision 4: CEI Order and Abort on Zero Recovery
- **Choice**: Verify winner & status, transition `status = STATE_RESUELTO` and `winner = winner`, redeem shares from vault. If `recovered == 0`, immediately revert with `b"norecover"`.
- **Rationale**: Conforms to Checks-Effects-Interactions and prevents resolving challenges with 0 payout when the vault has an issue or returns 0.

## Risks / Trade-offs

- [Risk: Breaking change to ChallengeResolved event] → Downstream indexers and Worker relayer need updating when redeployed (#24). Documented in proposal.
- [Risk: Contract storage layout shift] → `ChallengePool` is immutable and will be redeployed cleanly; storage layout compatibility with previous deployments is not required.
