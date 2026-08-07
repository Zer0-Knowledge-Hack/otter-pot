use alloy_primitives::U256;

// ─── State constants ─────────────────────────────────────────────────────────

pub const STATE_ABIERTO: u8 = 0;
pub const STATE_BLOQUEADO: u8 = 1;
pub const STATE_RESUELTO: u8 = 2;
pub const STATE_REEMBOLSADO: u8 = 3;

// Validation constants per SDD §11
/// Maximum allowed deposit per participant (10 ETH in wei) as a safety cap.
pub const MAX_DEPOSIT_WEI: u128 = 10_000_000_000_000_000_000; // 10 ETH

// ─── Commission & yield helpers ───────────────────────────────────────────────

/// Compute the commission for a payout.
///
/// `rate_bps` is in basis points (100 bps = 1%).
/// commission = total_payout * rate_bps / 10_000
pub fn commission_from(total_payout: U256, rate_bps: U256) -> U256 {
    if rate_bps.is_zero() {
        return U256::ZERO;
    }
    (total_payout * rate_bps) / U256::from(10_000u64)
}

/// Returns `(winner_payout, commission)` for a resolved challenge.
///
/// `recovered_assets` is the total USDC the pool recovered from the TreasuryVault
/// by redeeming its shares (principal + accrued yield, SDD §7.2). The commission
/// (SDD §8) is applied on that recovered total, and the winner receives the
/// remainder.
pub fn resolve_payout(recovered_assets: U256, commission_rate_bps: U256) -> (U256, U256) {
    if recovered_assets.is_zero() {
        return (U256::ZERO, U256::ZERO);
    }
    let commission = commission_from(recovered_assets, commission_rate_bps);
    let payout = recovered_assets.saturating_sub(commission);
    (payout, commission)
}

/// Compute the refund each participant receives (no commission, SDD §8.3).
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

// ─── State transition guards ──────────────────────────────────────────────────

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
        return Err("challenge_not_open");
    }
    if !is_participant {
        return Err("not_a_participant");
    }
    if already_deposited {
        return Err("already_deposited");
    }
    if sent_amount != required_deposit {
        return Err("incorrect_deposit_amount");
    }
    if sent_amount > U256::from(MAX_DEPOSIT_WEI) {
        return Err("deposit_exceeds_maximum");
    }
    Ok(())
}

/// Returns `Ok(())` if `confirm_result` can proceed.
///
/// Checks: challenge is Bloqueado, winner is non-zero.
pub fn validate_confirm_result(
    status: u8,
    winner: alloy_primitives::Address,
) -> Result<(), &'static str> {
    if status != STATE_BLOQUEADO {
        return Err("challenge_not_locked");
    }
    if winner == alloy_primitives::Address::ZERO {
        return Err("winner_is_zero_address");
    }
    Ok(())
}

/// Returns `Ok(())` if the refund can proceed.
///
/// Checks: challenge is Bloqueado, deadline has passed.
pub fn validate_refund(status: u8, deadline: U256, now: U256) -> Result<(), &'static str> {
    if status != STATE_BLOQUEADO {
        return Err("challenge_not_locked");
    }
    if now <= deadline {
        return Err("deadline_not_reached");
    }
    Ok(())
}

// ─── Tests ───────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use alloy_primitives::{Address, U256};

    // ── Helpers ──────────────────────────────────────────────────────────────

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

    // ── 1. Challenge creation (state = Abierto) ───────────────────────────────

    #[test]
    fn pool_size_calculated_correctly() {
        // 3 participants × 1 ETH = 3 ETH pool
        let pool = total_pool(eth(1), U256::from(3));
        assert_eq!(pool, eth(3));
    }

    // ── 2. Deposit validation ─────────────────────────────────────────────────

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
        assert_eq!(res.unwrap_err(), "challenge_not_open");
    }

    #[test]
    fn deposit_rejected_if_not_participant() {
        let res = validate_deposit(STATE_ABIERTO, false, false, eth(1), eth(1));
        assert_eq!(res.unwrap_err(), "not_a_participant");
    }

    #[test]
    fn deposit_rejected_if_already_deposited() {
        let res = validate_deposit(STATE_ABIERTO, true, true, eth(1), eth(1));
        assert_eq!(res.unwrap_err(), "already_deposited");
    }

    #[test]
    fn deposit_rejected_if_amount_wrong() {
        let res = validate_deposit(STATE_ABIERTO, true, false, eth(2), eth(1));
        assert_eq!(res.unwrap_err(), "incorrect_deposit_amount");
    }

    #[test]
    fn deposit_rejected_if_exceeds_maximum() {
        let huge = U256::from(MAX_DEPOSIT_WEI) + U256::from(1u64);
        let res = validate_deposit(STATE_ABIERTO, true, false, huge, huge);
        assert_eq!(res.unwrap_err(), "deposit_exceeds_maximum");
    }

    // ── 2b. ERC-20 USDC deposit path (SDD §6.5) ───────────────────────────────

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
        assert_eq!(res.unwrap_err(), "incorrect_deposit_amount");
    }

    #[test]
    fn usdc_total_pool_scales_with_participants() {
        let total = total_pool(usdc(25), U256::from(4));
        assert_eq!(total, usdc(100));
    }

    // ── 3. confirm_result validation ──────────────────────────────────────────

    #[test]
    fn confirm_accepted_when_locked() {
        let res = validate_confirm_result(STATE_BLOQUEADO, addr(1));
        assert!(res.is_ok());
    }

    #[test]
    fn confirm_rejected_if_not_locked() {
        let res = validate_confirm_result(STATE_ABIERTO, addr(1));
        assert_eq!(res.unwrap_err(), "challenge_not_locked");
    }

    #[test]
    fn confirm_rejected_if_winner_is_zero() {
        let res = validate_confirm_result(STATE_BLOQUEADO, Address::ZERO);
        assert_eq!(res.unwrap_err(), "winner_is_zero_address");
    }

    // ── 4. Resolution payout (commission model, SDD §8) ──────────────────────

    #[test]
    fn resolve_payout_applies_commission_on_recovered_total() {
        // Recovered 2 USDC from the vault, 5 % commission → winner gets 2 * 0.95
        let recovered = eth(2);
        let (payout, commission) = resolve_payout(recovered, BPS_5);

        let expected_commission = recovered * U256::from(500u64) / U256::from(10_000u64);
        let expected_payout = recovered - expected_commission;

        assert_eq!(commission, expected_commission);
        assert_eq!(payout, expected_payout);
    }

    #[test]
    fn resolve_payout_zero_commission_passes_all_to_winner() {
        let recovered = eth(3);
        let (payout, commission) = resolve_payout(recovered, BPS_0);
        assert!(commission.is_zero());
        assert_eq!(payout, recovered);
    }

    #[test]
    fn resolve_payout_zero_recovered_is_zero() {
        let (payout, commission) = resolve_payout(U256::ZERO, BPS_5);
        assert!(payout.is_zero());
        assert!(commission.is_zero());
    }

    #[test]
    fn commission_never_exceeds_total_payout() {
        // Even at 100 % rate (10_000 bps) commission == recovered, payout == 0
        let recovered = eth(1);
        let full_rate = U256::from(10_000u64);
        let (payout, commission) = resolve_payout(recovered, full_rate);
        assert!(payout.is_zero());
        assert_eq!(commission, recovered);
    }

    // ── 5. Refund (SDD §8.3 — no commission) ─────────────────────────────────

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
        assert_eq!(res.unwrap_err(), "deadline_not_reached");
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
        assert_eq!(res.unwrap_err(), "challenge_not_locked");
    }

    // ── 6. State constants sanity-check ──────────────────────────────────────

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
