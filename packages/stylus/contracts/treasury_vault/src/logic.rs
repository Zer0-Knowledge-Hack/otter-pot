// Lógica pura de la Tesorería: no hace llamadas EVM y es testeable en host.
use alloy_primitives::U256;

/// Exceso de valor de la estrategia por encima del valor medido la última vez.
/// Solo acredita deltas positivos (MVP no reconcilia pérdidas a la baja).
pub fn positive_yield_delta(balance: U256, deployed: U256) -> U256 {
    balance.saturating_sub(deployed)
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
    fn yield_delta_positive() {
        assert_eq!(positive_yield_delta(u(120), u(100)), u(20));
    }

    #[test]
    fn yield_delta_zero_when_balance_below_deployed() {
        assert_eq!(positive_yield_delta(u(90), u(100)), U256::ZERO);
    }

    #[test]
    fn yield_delta_zero_when_equal() {
        assert_eq!(positive_yield_delta(u(100), u(100)), U256::ZERO);
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
}
