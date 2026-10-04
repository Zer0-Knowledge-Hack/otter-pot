// Pure treasury logic: makes no EVM calls and is host-testable.
use alloy_primitives::U256;

/// Result of reading the active strategy balance.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum BalanceRead {
    /// No strategy is configured.
    NoStrategy,
    /// The strategy reported a valid balance.
    Measured(U256),
    /// The read failed or returned a short/invalid result.
    Unavailable,
}

/// Direction and size of the accounting change recognised by an accrual.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum YieldDelta {
    None,
    Gain(U256),
    Loss(U256),
}

/// New accounting values after reconciling against the measured strategy balance.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Reconciled {
    pub total_assets: U256,
    pub deployed: U256,
    pub delta: YieldDelta,
}

/// Reconciles total assets against the measured strategy balance, in both directions.
/// `deployed` becomes the measured value; shares are never touched.
pub fn reconcile(total_assets: U256, deployed: U256, measured: U256) -> Reconciled {
    if measured > deployed {
        let gain = measured - deployed;
        Reconciled {
            total_assets: total_assets.saturating_add(gain),
            deployed: measured,
            delta: YieldDelta::Gain(gain),
        }
    } else if measured < deployed {
        let loss = deployed - measured;
        Reconciled {
            total_assets: total_assets.saturating_sub(loss),
            deployed: measured,
            delta: YieldDelta::Loss(loss),
        }
    } else {
        Reconciled {
            total_assets,
            deployed,
            delta: YieldDelta::None,
        }
    }
}

/// Accrual policy: skipped (`None`) when there is no strategy or the read failed,
/// so the previous accounting and share price are kept.
pub fn accrue(total_assets: U256, deployed: U256, read: BalanceRead) -> Option<Reconciled> {
    match read {
        BalanceRead::Measured(measured) => Some(reconcile(total_assets, deployed, measured)),
        BalanceRead::NoStrategy | BalanceRead::Unavailable => None,
    }
}

/// Shares minted for a deposit: 1:1 only when no shares exist, otherwise
/// `assets * total_shares / total_assets` rounded down.
pub fn shares_for_deposit(
    assets: U256,
    total_assets: U256,
    total_shares: U256,
) -> Result<U256, &'static [u8]> {
    if total_shares.is_zero() {
        return Ok(assets);
    }
    if total_assets.is_zero() {
        return Err(b"zero_share_price");
    }
    let shares = assets.saturating_mul(total_shares) / total_assets;
    if shares.is_zero() {
        return Err(b"zero_shares_minted");
    }
    Ok(shares)
}

/// Assets paid for a redeem: `shares * total_assets / total_shares` rounded down.
pub fn assets_for_redeem(shares: U256, total_assets: U256, total_shares: U256) -> U256 {
    if total_shares.is_zero() {
        return U256::ZERO;
    }
    shares.saturating_mul(total_assets) / total_shares
}

/// USDC que falta retirar de la estrategia para cubrir un monto a pagar.
pub fn withdraw_shortfall(assets: U256, idle: U256) -> U256 {
    assets.saturating_sub(idle)
}

/// Valida un monto a desplegar en la estrategia contra el saldo inactivo.
pub fn validate_deploy_amount(amount: U256, idle: U256) -> Result<(), &'static [u8]> {
    if amount.is_zero() {
        return Err(b"zero_amount");
    }
    if amount > idle {
        return Err(b"insufficient_idle");
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use alloy_primitives::U256;

    fn u(v: u64) -> U256 {
        U256::from(v)
    }

    #[test]
    fn shortfall_computed_when_idle_insufficient() {
        assert_eq!(withdraw_shortfall(u(150), u(100)), u(50));
    }

    #[test]
    fn shortfall_zero_when_idle_sufficient() {
        assert_eq!(withdraw_shortfall(u(80), u(100)), U256::ZERO);
    }

    #[test]
    fn shortfall_equal_when_no_idle() {
        assert_eq!(withdraw_shortfall(u(60), U256::ZERO), u(60));
    }

    #[test]
    fn deploy_amount_zero_rejected() {
        assert!(validate_deploy_amount(U256::ZERO, u(100)).is_err());
    }

    #[test]
    fn deploy_amount_above_idle_rejected() {
        assert!(validate_deploy_amount(u(101), u(100)).is_err());
    }

    #[test]
    fn deploy_amount_ok() {
        assert!(validate_deploy_amount(u(50), u(100)).is_ok());
    }

    #[test]
    fn reconcile_gain() {
        let r = reconcile(u(100), u(100), u(110));
        assert_eq!(r.total_assets, u(110));
        assert_eq!(r.deployed, u(110));
        assert_eq!(r.delta, YieldDelta::Gain(u(10)));
    }

    #[test]
    fn reconcile_loss() {
        let r = reconcile(u(100), u(100), u(95));
        assert_eq!(r.total_assets, u(95));
        assert_eq!(r.deployed, u(95));
        assert_eq!(r.delta, YieldDelta::Loss(u(5)));
    }

    #[test]
    fn reconcile_equal() {
        let r = reconcile(u(100), u(100), u(100));
        assert_eq!(r.total_assets, u(100));
        assert_eq!(r.deployed, u(100));
        assert_eq!(r.delta, YieldDelta::None);
    }

    #[test]
    fn reconcile_loss_above_total_saturates_to_zero() {
        let r = reconcile(u(3), u(100), u(90));
        assert_eq!(r.total_assets, U256::ZERO);
        assert_eq!(r.deployed, u(90));
        assert_eq!(r.delta, YieldDelta::Loss(u(10)));
    }

    #[test]
    fn accrue_skips_without_strategy() {
        assert_eq!(accrue(u(100), u(100), BalanceRead::NoStrategy), None);
    }

    #[test]
    fn accrue_skips_when_read_unavailable() {
        assert_eq!(accrue(u(100), u(100), BalanceRead::Unavailable), None);
    }

    #[test]
    fn accrue_reconciles_when_measured() {
        let r = accrue(u(100), u(100), BalanceRead::Measured(u(110))).unwrap();
        assert_eq!(r.delta, YieldDelta::Gain(u(10)));
        assert_eq!(r.total_assets, u(110));
    }

    #[test]
    fn shares_one_to_one_when_no_shares() {
        assert_eq!(
            shares_for_deposit(u(100), U256::ZERO, U256::ZERO),
            Ok(u(100))
        );
    }

    #[test]
    fn shares_one_to_one_ignores_assets_when_no_shares() {
        assert_eq!(shares_for_deposit(u(100), u(7), U256::ZERO), Ok(u(100)));
    }

    #[test]
    fn shares_fair_split_after_yield() {
        // 100 deposited at 110 assets / 100 shares (6 decimals).
        let r = shares_for_deposit(u(100_000_000), u(110_000_000), u(100_000_000));
        assert_eq!(r, Ok(u(90_909_090)));
    }

    #[test]
    fn shares_reject_zero_share_price() {
        assert_eq!(
            shares_for_deposit(u(100), U256::ZERO, u(50)),
            Err(&b"zero_share_price"[..])
        );
    }

    #[test]
    fn shares_reject_zero_minted() {
        assert_eq!(
            shares_for_deposit(u(1), u(1000), u(100)),
            Err(&b"zero_shares_minted"[..])
        );
    }

    #[test]
    fn redeem_floors() {
        assert_eq!(assets_for_redeem(u(1), u(10), u(3)), u(3));
    }

    #[test]
    fn redeem_after_loss() {
        assert_eq!(assets_for_redeem(u(100), u(95), u(100)), u(95));
    }

    #[test]
    fn redeem_zero_assets_after_total_loss() {
        assert_eq!(assets_for_redeem(u(10), U256::ZERO, u(10)), U256::ZERO);
    }

    #[test]
    fn redeem_zero_total_shares_is_zero() {
        assert_eq!(assets_for_redeem(u(10), u(5), U256::ZERO), U256::ZERO);
    }
}
