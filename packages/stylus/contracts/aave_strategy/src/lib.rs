#![cfg_attr(all(target_arch = "wasm32", not(feature = "export-abi")), no_main)]

#[cfg(any(target_arch = "wasm32", feature = "export-abi"))]
extern crate alloc;

#[cfg(any(target_arch = "wasm32", feature = "export-abi"))]
pub mod contract {
    use alloy_primitives::{Address, U256};
    use alloy_sol_types::{sol, SolCall};
    use stylus_sdk::{
        call, contract, evm, msg,
        prelude::*,
        storage::{StorageAddress, StorageBool},
    };

    // ── Interfaces externas ───────────────────────────────────────────────────
    // Aave V3 Pool (Arbitrum Sepolia) y ERC-20 (USDC/aUSDC).
    sol! {
        interface IPool {
            function supply(address asset, uint256 amount, address onBehalfOf, uint16 referralCode) external;
            function withdraw(address asset, uint256 amount, address to) external returns (uint256);
        }
        interface IERC20 {
            function transferFrom(address from, address to, uint256 amount) external returns (bool);
            function transfer(address to, uint256 amount) external returns (bool);
            function approve(address spender, uint256 amount) external returns (bool);
            function balanceOf(address account) external view returns (uint256);
        }
    }

    // ── Eventos ────────────────────────────────────────────────────────────────

    sol! {
        event StrategyInitialized(address indexed owner, address indexed pool, address indexed usdc, address atoken);
        event VaultSet(address indexed vault);
        event Deposited(uint256 amount, address indexed from);
        event Withdrawn(uint256 amount, address indexed to);
    }

    // ── Almacenamiento ─────────────────────────────────────────────────────────

    #[storage]
    #[entrypoint]
    pub struct AaveStrategy {
        pub initialized: StorageBool,
        /// Owner del adaptador (cuenta administradora del equipo).
        pub owner: StorageAddress,
        /// Único contrato autorizado para depositar/retirar.
        pub vault: StorageAddress,
        /// Aave V3 Pool (Arbitrum Sepolia: 0xBfC91D59fAA134A4ED45f7B584cAf96D7792Eff).
        pub pool: StorageAddress,
        /// Activo subyacente (USDC).
        pub usdc: StorageAddress,
        /// aToken de USDC (aUSDC) que representa la posición.
        pub atoken: StorageAddress,
    }

    impl AaveStrategy {
        fn require_owner(&self) -> Result<(), Vec<u8>> {
            if msg::sender() != self.owner.get() {
                return Err(b"not_owner".to_vec());
            }
            Ok(())
        }

        fn require_vault(&self) -> Result<(), Vec<u8>> {
            if msg::sender() != self.vault.get() {
                return Err(b"not_vault".to_vec());
            }
            Ok(())
        }

        fn token_balance(&self, token: Address, who: Address) -> U256 {
            let call = IERC20::balanceOfCall { account: who };
            let data = call.abi_encode();
            match call::static_call(self, token, &data) {
                Ok(out) => read_u256(&out),
                Err(_) => U256::ZERO,
            }
        }
    }

    // ── Interfaz pública ──────────────────────────────────────────────────────

    #[public]
    impl AaveStrategy {
        /// Inicializador de una sola vez. El llamador pasa a ser el owner.
        /// `pool` y `usdc` son las direcciones de Aave V3 y del USDC; `atoken`
        /// es el aUSDC correspondiente (Arbitrum Sepolia: 0x460b97BD498E1157530AEb3086301d5225b91216).
        pub fn init(
            &mut self,
            pool: Address,
            usdc: Address,
            atoken: Address,
        ) -> Result<(), Vec<u8>> {
            if self.initialized.get() {
                return Err(b"already_initialized".to_vec());
            }
            if pool == Address::ZERO || usdc == Address::ZERO || atoken == Address::ZERO {
                return Err(b"invalid_address".to_vec());
            }
            self.initialized.set(true);
            self.owner.set(msg::sender());
            self.pool.set(pool);
            self.usdc.set(usdc);
            self.atoken.set(atoken);
            evm::log(StrategyInitialized {
                owner: msg::sender(),
                pool,
                usdc,
                atoken,
            });
            Ok(())
        }

        /// Autoriza al vault a depositar/retirar. Solo owner.
        pub fn set_vault(&mut self, vault: Address) -> Result<(), Vec<u8>> {
            self.require_owner()?;
            if vault == Address::ZERO {
                return Err(b"invalid_address".to_vec());
            }
            self.vault.set(vault);
            evm::log(VaultSet { vault });
            Ok(())
        }

        /// Deposita USDC en Aave V3 en nombre del adaptador. Solo vault.
        pub fn deposit(&mut self, amount: U256) -> Result<(), Vec<u8>> {
            self.require_vault()?;
            if amount.is_zero() {
                return Err(b"zero_amount".to_vec());
            }
            let me = contract::address();
            let usdc = self.usdc.get();
            let pool = self.pool.get();

            // 1) Recibir USDC del vault.
            let data = IERC20::transferFromCall {
                from: msg::sender(),
                to: me,
                amount,
            }
            .abi_encode();
            call::call(&mut *self, usdc, &data).map_err(|_| b"transferFrom_failed".to_vec())?;

            // Verificación robusta del ingreso.
            if self.token_balance(usdc, me) < amount {
                return Err(b"usdc_not_transferred".to_vec());
            }

            // 2) Aprobar y suplir al Pool.
            let approve = IERC20::approveCall {
                spender: pool,
                amount,
            }
            .abi_encode();
            call::call(&mut *self, usdc, &approve).map_err(|_| b"approve_failed".to_vec())?;

            let supply = IPool::supplyCall {
                asset: usdc,
                amount,
                onBehalfOf: me,
                referralCode: 0,
            }
            .abi_encode();
            call::call(&mut *self, pool, &supply).map_err(|_| b"supply_failed".to_vec())?;

            // 3) Verificar que la posición aUSDC creció.
            let after = self.token_balance(self.atoken.get(), me);
            if after < amount {
                return Err(b"atoken_not_credited".to_vec());
            }

            evm::log(Deposited {
                amount,
                from: msg::sender(),
            });
            Ok(())
        }

        /// Retira USDC de Aave V3 y lo devuelve al vault. Solo vault.
        pub fn withdraw(&mut self, amount: U256) -> Result<U256, Vec<u8>> {
            self.require_vault()?;
            if amount.is_zero() {
                return Ok(U256::ZERO);
            }
            let me = contract::address();
            let usdc = self.usdc.get();
            let pool = self.pool.get();

            let wd = IPool::withdrawCall {
                asset: usdc,
                amount,
                to: me,
            }
            .abi_encode();
            let out = call::call(&mut *self, pool, &wd).map_err(|_| b"withdraw_failed".to_vec())?;
            let received = read_u256(&out);
            if received.is_zero() {
                return Err(b"no_assets_withdrawn".to_vec());
            }

            // El USDC quedó en el adaptador: transferirlo al vault.
            let transfer = IERC20::transferCall {
                to: msg::sender(),
                amount: received,
            }
            .abi_encode();
            call::call(&mut *self, usdc, &transfer).map_err(|_| b"transfer_failed".to_vec())?;

            evm::log(Withdrawn {
                amount: received,
                to: msg::sender(),
            });
            Ok(received)
        }

        /// Valor de la posición en aUSDC (1:1 con USDC). View.
        pub fn balance_of(&self) -> U256 {
            self.token_balance(self.atoken.get(), contract::address())
        }

        /// Alias de `balanceOf`.
        pub fn total_assets(&self) -> U256 {
            self.balance_of()
        }

        /// Retorna la dirección del vault autorizado.
        pub fn vault(&self) -> Address {
            self.vault.get()
        }
    }

    fn read_u256(data: &[u8]) -> U256 {
        if data.len() < 32 {
            return U256::ZERO;
        }
        U256::from_be_slice(&data[..32])
    }
}
