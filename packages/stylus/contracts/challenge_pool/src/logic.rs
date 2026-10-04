use alloy_primitives::U256;

// ─── State constants ─────────

pub const STATE_ABIERTO: u8 = 0;
pub const STATE_BLOQUEADO: u8 = 1;
pub const STATE_RESUELTO: u8 = 2;
pub const STATE_REEMBOLSADO: u8 = 3;

// Validation constants
/// Maximum allowed deposit per participant (10 ETH in wei) as a safety cap.
pub const MAX_DEPOSIT_WEI: u128 = 10_000_000_000_000_000_000; // 10 ETH
/// Maximum platform commission in basis points (1000 bps = 10%).
pub const MAX_COMMISSION_BPS: u64 = 1000;
pub const BPS_DIVISOR: u64 = 10_000;

// ─── Commission & yield helpers ──────────────────

/// Compute the platform target commission based on the challenge pool principal.
///
/// `target = (pool * rate_bps) / 10_000`
pub fn commission_target(pool: U256, rate_bps: U256) -> U256 {
    if rate_bps.is_zero() || pool.is_zero() {
        return U256::ZERO;
    }
    (pool * rate_bps) / U256::from(BPS_DIVISOR)
}

/// Returns `(winner_payout, fee, surplus)` for a resolved challenge.
///
/// Formulas:
/// - `target  = pool × rate_bps / 10 000`
/// - `fee     = min(target, recovered)`
/// - `winner  = min(pool, recovered − fee)`
/// - `surplus = recovered − fee − winner`  (routed to fee recipient)
///
/// Invariants:
/// - `winner <= pool`
/// - `winner + fee + surplus == recovered`
pub fn resolve_payout(recovered: U256, pool: U256, rate_bps: U256) -> (U256, U256, U256) {
    if recovered.is_zero() {
        return (U256::ZERO, U256::ZERO, U256::ZERO);
    }
    let target = commission_target(pool, rate_bps);
    let fee = core::cmp::min(target, recovered);
    let available_for_winner = recovered - fee;
    let winner = core::cmp::min(pool, available_for_winner);
    let surplus = available_for_winner - winner;
    (winner, fee, surplus)
}

/// Compute the refund each participant receives (no commission).
///
/// `treasury_shares` is the total pool amount (principal + accrued yield).
/// Returns `treasury_shares / participant_count` or zero if count is zero.
pub fn refund_per_participant(treasury_shares: U256, participant_count: U256) -> U256 {
    if participant_count.is_zero() {
        return U256::ZERO;
    }
    treasury_shares / participant_count
}

/// Compute total pool size after all participants deposit.
pub fn total_pool(required_deposit: U256, participant_count: U256) -> U256 {
    required_deposit * participant_count
}

// ─── State transition guards ──

/// Returns `Ok(())` if the deposit can be accepted.
///
/// Checks: challenge is Abierto, caller is registered, not already deposited,
/// amount equals required_deposit.
pub fn validate_deposit(
    status: u8,
    is_participant: bool,
    already_deposited: bool,
    sent_amount: U256,
    required_deposit: U256,
) -> Result<(), &'static str> {
    if status != STATE_ABIERTO {
        return Err("notopen");
    }
    if !is_participant {
        return Err("nopart");
    }
    if already_deposited {
        return Err("deposited");
    }
    if sent_amount != required_deposit {
        return Err("incdep");
    }
    if sent_amount > U256::from(MAX_DEPOSIT_WEI) {
        return Err("depmax");
    }
    Ok(())
}

/// Returns `Ok(())` if `confirm_result` can proceed.
///
/// Checks: challenge is Bloqueado, winner is non-zero.
/// `winner_is_participant` must come from `challenge.participants.get(winner)`.
/// This prevents an operator from directing funds to an arbitrary address.
pub fn validate_confirm_result(
    status: u8,
    winner: alloy_primitives::Address,
    winner_is_participant: bool,
) -> Result<(), &'static str> {
    if status != STATE_BLOQUEADO {
        return Err("notlocked");
    }
    if winner == alloy_primitives::Address::ZERO {
        return Err("winzero");
    }
    if !winner_is_participant {
        return Err("winpart");
    }
    Ok(())
}

/// Returns `Ok(())` if the refund can proceed.
///
/// Checks: challenge is Bloqueado, deadline has passed.
pub fn validate_refund(status: u8, deadline: U256, now: U256) -> Result<(), &'static str> {
    if status != STATE_BLOQUEADO {
        return Err("notlocked");
    }
    if now <= deadline {
        return Err("nodln");
    }
    Ok(())
}

// ─── Tests ───────

#[cfg(test)]
mod tests {
    use super::*;
    use alloy_primitives::{Address, U256};

    // ── 0. Commission rate validation ───────────

    // ── Helpers ──

    fn addr(n: u8) -> Address {
        let mut bytes = [0u8; 20];
        bytes[19] = n;
        Address::from(bytes)
    }

    fn eth(n: u64) -> U256 {
        U256::from(n) * U256::from(1_000_000_000_000_000_000u128)
    }

    /// USDC with 6 decimals.
    fn usdc(n: u64) -> U256 {
        U256::from(n) * U256::from(1_000_000u128)
    }

    const BPS_5: U256 = U256::from_limbs([500, 0, 0, 0]); // 5 %
    const BPS_0: U256 = U256::ZERO;

    // ── 1. Challenge creation (state = Abierto) ──

    #[test]
    fn pool_size_calculated_correctly() {
        // 3 participants × 1 ETH = 3 ETH pool
        let pool = total_pool(eth(1), U256::from(3));
        assert_eq!(pool, eth(3));
    }

    // ── 2. Deposit validation ────────────────────

    #[test]
    fn valid_deposit_accepted() {
        let res = validate_deposit(
            STATE_ABIERTO,
            true,  // is_participant
            false, // already_deposited
            eth(1),
            eth(1),
        );
        assert!(res.is_ok());
    }

    #[test]
    fn deposit_rejected_if_challenge_not_open() {
        let res = validate_deposit(STATE_BLOQUEADO, true, false, eth(1), eth(1));
        assert_eq!(res.unwrap_err(), "notopen");
    }

    #[test]
    fn deposit_rejected_if_not_participant() {
        let res = validate_deposit(STATE_ABIERTO, false, false, eth(1), eth(1));
        assert_eq!(res.unwrap_err(), "nopart");
    }

    #[test]
    fn deposit_rejected_if_already_deposited() {
        let res = validate_deposit(STATE_ABIERTO, true, true, eth(1), eth(1));
        assert_eq!(res.unwrap_err(), "deposited");
    }

    #[test]
    fn deposit_rejected_if_amount_wrong() {
        let res = validate_deposit(STATE_ABIERTO, true, false, eth(2), eth(1));
        assert_eq!(res.unwrap_err(), "incdep");
    }

    #[test]
    fn deposit_rejected_if_exceeds_maximum() {
        let huge = U256::from(MAX_DEPOSIT_WEI) + U256::from(1u64);
        let res = validate_deposit(STATE_ABIERTO, true, false, huge, huge);
        assert_eq!(res.unwrap_err(), "depmax");
    }

    // ── 2b. ERC-20 USDC deposit path ──

    #[test]
    fn usdc_deposit_accepted_at_exact_required_amount() {
        // Participant approved exactly `required_deposit` USDC (6 decimals).
        let required = usdc(25);
        let res = validate_deposit(STATE_ABIERTO, true, false, required, required);
        assert!(res.is_ok());
    }

    #[test]
    fn usdc_deposit_rejected_if_value_bytes_mismatch() {
        // A deposit that transfers a different amount than required.
        let res = validate_deposit(STATE_ABIERTO, true, false, usdc(30), usdc(25));
        assert_eq!(res.unwrap_err(), "incdep");
    }

    #[test]
    fn usdc_total_pool_scales_with_participants() {
        let total = total_pool(usdc(25), U256::from(4));
        assert_eq!(total, usdc(100));
    }

    // ── 3. confirm_result validation ─────────────

    #[test]
    fn confirm_accepted_when_locked() {
        let res = validate_confirm_result(STATE_BLOQUEADO, addr(1), true);
        assert!(res.is_ok());
    }

    #[test]
    fn confirm_rejected_if_not_locked() {
        let res = validate_confirm_result(STATE_ABIERTO, addr(1), true);
        assert_eq!(res.unwrap_err(), "notlocked");
    }

    #[test]
    fn confirm_rejected_if_winner_is_zero() {
        let res = validate_confirm_result(STATE_BLOQUEADO, Address::ZERO, true);
        assert_eq!(res.unwrap_err(), "winzero");
    }

    /// Security guard: operator relays a decision but cannot choose an arbitrary winner.
    #[test]
    fn confirm_rejected_if_winner_is_not_participant() {
        let res = validate_confirm_result(STATE_BLOQUEADO, addr(9), false);
        assert_eq!(res.unwrap_err(), "winpart");
    }

    /// State check precedes participant check.
    #[test]
    fn confirm_state_check_precedes_participant_check() {
        let res = validate_confirm_result(STATE_ABIERTO, addr(9), false);
        assert_eq!(res.unwrap_err(), "notlocked");
    }

    // ── 4. Resolution payout ──

    fn assert_payout_invariants(recovered: U256, pool: U256, rate_bps: U256) -> (U256, U256, U256) {
        let (winner, fee, surplus) = resolve_payout(recovered, pool, rate_bps);
        assert!(
            winner <= pool,
            "invariant violated: winner ({winner}) > pool ({pool})"
        );
        assert_eq!(
            winner + fee + surplus,
            recovered,
            "invariant violated: winner ({winner}) + fee ({fee}) + surplus ({surplus}) != recovered ({recovered})"
        );
        (winner, fee, surplus)
    }

    #[test]
    fn dd01_table_yield_0() {
        // Pool = 100, Recovered = 100, Rate = 5 % (500 bps) → Fee = 5, Winner = 95, Surplus = 0
        let (winner, fee, surplus) = assert_payout_invariants(usdc(100), usdc(100), BPS_5);
        assert_eq!(fee, usdc(5));
        assert_eq!(winner, usdc(95));
        assert_eq!(surplus, usdc(0));
    }

    #[test]
    fn dd01_table_yield_3() {
        // Pool = 100, Recovered = 103, Rate = 5 % (500 bps) → Fee = 5, Winner = 98, Surplus = 0
        let (winner, fee, surplus) = assert_payout_invariants(usdc(103), usdc(100), BPS_5);
        assert_eq!(fee, usdc(5));
        assert_eq!(winner, usdc(98));
        assert_eq!(surplus, usdc(0));
    }

    #[test]
    fn dd01_table_yield_5() {
        // Pool = 100, Recovered = 105, Rate = 5 % (500 bps) → Fee = 5, Winner = 100, Surplus = 0
        let (winner, fee, surplus) = assert_payout_invariants(usdc(105), usdc(100), BPS_5);
        assert_eq!(fee, usdc(5));
        assert_eq!(winner, usdc(100));
        assert_eq!(surplus, usdc(0));
    }

    #[test]
    fn dd01_table_yield_8() {
        // Pool = 100, Recovered = 108, Rate = 5 % (500 bps) → Fee = 5, Winner = 100, Surplus = 3
        let (winner, fee, surplus) = assert_payout_invariants(usdc(108), usdc(100), BPS_5);
        assert_eq!(fee, usdc(5));
        assert_eq!(winner, usdc(100));
        assert_eq!(surplus, usdc(3));
    }

    #[test]
    fn dd01_table_loss_10() {
        // Pool = 100, Recovered = 90, Rate = 5 % (500 bps) → Fee = 5, Winner = 85, Surplus = 0
        let (winner, fee, surplus) = assert_payout_invariants(usdc(90), usdc(100), BPS_5);
        assert_eq!(fee, usdc(5));
        assert_eq!(winner, usdc(85));
        assert_eq!(surplus, usdc(0));
    }

    #[test]
    fn resolve_payout_severe_loss_recovered_less_than_fee() {
        // Target = 5, but recovered = 3 → Fee = 3, Winner = 0, Surplus = 0
        let (winner, fee, surplus) = assert_payout_invariants(usdc(3), usdc(100), BPS_5);
        assert_eq!(fee, usdc(3));
        assert_eq!(winner, usdc(0));
        assert_eq!(surplus, usdc(0));
    }

    #[test]
    fn resolve_payout_zero_recovered_is_all_zero() {
        let (winner, fee, surplus) = assert_payout_invariants(U256::ZERO, usdc(100), BPS_5);
        assert_eq!(winner, U256::ZERO);
        assert_eq!(fee, U256::ZERO);
        assert_eq!(surplus, U256::ZERO);
    }

    #[test]
    fn resolve_payout_zero_commission_rate() {
        // No commission: recovered = 100 → winner = 100, fee = 0, surplus = 0
        let (winner, fee, surplus) = assert_payout_invariants(usdc(100), usdc(100), BPS_0);
        assert_eq!(winner, usdc(100));
        assert_eq!(fee, U256::ZERO);
        assert_eq!(surplus, U256::ZERO);

        // No commission with yield: recovered = 108 → winner = 100, fee = 0, surplus = 8
        let (winner, fee, surplus) = assert_payout_invariants(usdc(108), usdc(100), BPS_0);
        assert_eq!(winner, usdc(100));
        assert_eq!(fee, U256::ZERO);
        assert_eq!(surplus, usdc(8));
    }

    #[test]
    fn resolve_payout_max_commission_10_000_bps() {
        let full_rate = U256::from(10_000u64);
        // Pool = 100, Target = 100, Recovered = 100 → fee = 100, winner = 0, surplus = 0
        let (winner, fee, surplus) = assert_payout_invariants(usdc(100), usdc(100), full_rate);
        assert_eq!(fee, usdc(100));
        assert_eq!(winner, U256::ZERO);
        assert_eq!(surplus, U256::ZERO);

        // Pool = 100, Target = 100, Recovered = 108 → fee = 100, winner = 8, surplus = 0
        let (winner, fee, surplus) = assert_payout_invariants(usdc(108), usdc(100), full_rate);
        assert_eq!(fee, usdc(100));
        assert_eq!(winner, usdc(8));
        assert_eq!(surplus, U256::ZERO);
    }

    #[test]
    fn resolve_payout_matrix_invariants() {
        let pools = [usdc(10), usdc(100), usdc(1_000)];
        let rates = [
            U256::ZERO,
            U256::from(100u64),
            BPS_5,
            U256::from(1000u64),
            U256::from(10_000u64),
        ];
        let recovered_factors = [0u64, 50, 95, 100, 103, 105, 108, 150];

        for &p in &pools {
            for &r in &rates {
                for &f in &recovered_factors {
                    let rec = (p * U256::from(f)) / U256::from(100u64);
                    assert_payout_invariants(rec, p, r);
                }
            }
        }
    }

    // ── 5. Refund ────

    #[test]
    fn refund_per_participant_splits_evenly() {
        // 3 ETH pool, 3 participants → 1 ETH each
        let refund = refund_per_participant(eth(3), U256::from(3));
        assert_eq!(refund, eth(1));
    }

    #[test]
    fn refund_per_participant_zero_if_no_participants() {
        let refund = refund_per_participant(eth(3), U256::ZERO);
        assert!(refund.is_zero());
    }

    #[test]
    fn refund_rejected_before_deadline() {
        let now = U256::from(1_000u64);
        let deadline = U256::from(2_000u64);
        let res = validate_refund(STATE_BLOQUEADO, deadline, now);
        assert_eq!(res.unwrap_err(), "nodln");
    }

    #[test]
    fn refund_accepted_after_deadline() {
        let now = U256::from(3_000u64);
        let deadline = U256::from(2_000u64);
        let res = validate_refund(STATE_BLOQUEADO, deadline, now);
        assert!(res.is_ok());
    }

    #[test]
    fn refund_rejected_if_not_locked() {
        let res = validate_refund(STATE_ABIERTO, U256::ZERO, U256::from(1u64));
        assert_eq!(res.unwrap_err(), "notlocked");
    }

    // ── 6. State constants sanity-check ─────────

    #[test]
    fn state_constants_are_distinct() {
        let states = [
            STATE_ABIERTO,
            STATE_BLOQUEADO,
            STATE_RESUELTO,
            STATE_REEMBOLSADO,
        ];
        let unique: std::collections::HashSet<_> = states.iter().collect();
        assert_eq!(unique.len(), 4, "duplicate state constant");
    }
}
