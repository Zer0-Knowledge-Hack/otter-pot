//! Llamadas cross-contract hacia el adaptador de estrategia activo (IStrategy).
//!
//! Este módulo se compila solo en el target wasm32 (es submodulo de `contract`):
//! contiene la interfaz que el vault usa para desplegar/retirar USDC en
//! cualquier protocolo de rendimiento sin conocer su implementación (SDD §7.3).

use alloy_primitives::{Address, U256};
use alloy_sol_types::{sol, SolCall};
use stylus_sdk::call;

use super::TreasuryVault;

sol! {
    interface IStrategy {
        function deposit(uint256 amount) external;
        function withdraw(uint256 amount) external returns (uint256);
        function balanceOf() external view returns (uint256);
        function totalAssets() external view returns (uint256);
    }
}

/// Despliega `amount` USDC en la estrategia activa.
#[allow(deprecated)]
pub fn strategy_deposit(
    contract: &mut TreasuryVault,
    strategy: Address,
    amount: U256,
) -> Result<(), Vec<u8>> {
    if strategy == Address::ZERO {
        return Err(b"strategy_not_set".to_vec());
    }
    if amount.is_zero() {
        return Ok(());
    }
    let data = IStrategy::depositCall { amount }.abi_encode();
    call::call(contract, strategy, &data).map_err(|_| b"strategy_deposit_failed".to_vec())?;
    Ok(())
}

/// Retira `amount` USDC de la estrategia y devuelve lo efectivamente recibido.
#[allow(deprecated)]
pub fn strategy_withdraw(
    contract: &mut TreasuryVault,
    strategy: Address,
    amount: U256,
) -> Result<U256, Vec<u8>> {
    if strategy == Address::ZERO {
        return Err(b"strategy_not_set".to_vec());
    }
    if amount.is_zero() {
        return Ok(U256::ZERO);
    }
    let data = IStrategy::withdrawCall { amount }.abi_encode();
    let out =
        call::call(contract, strategy, &data).map_err(|_| b"strategy_withdraw_failed".to_vec())?;
    Ok(read_u256(&out))
}

/// Valor actual bajo gestión de la estrategia, en USDC (aUSDC).
#[allow(deprecated)]
pub fn strategy_balance_of(contract: &TreasuryVault, strategy: Address) -> U256 {
    if strategy == Address::ZERO {
        return U256::ZERO;
    }
    let data = IStrategy::balanceOfCall {}.abi_encode();
    match call::static_call(contract, strategy, &data) {
        Ok(out) => read_u256(&out),
        Err(_) => U256::ZERO,
    }
}

fn read_u256(data: &[u8]) -> U256 {
    if data.len() < 32 {
        return U256::ZERO;
    }
    U256::from_be_slice(&data[..32])
}
