#![cfg_attr(all(target_arch = "wasm32", not(feature = "export-abi")), no_main)]

#[cfg(target_arch = "wasm32")]
extern crate alloc;

#[cfg(target_arch = "wasm32")]
pub mod contract {
    use alloy_primitives::{Address, U256};
    use alloy_sol_types::{sol, SolCall};
    use stylus_sdk::{
        call, contract, evm, msg,
        prelude::*,
        storage::{StorageAddress, StorageBool, StorageMap, StorageU256},
    };

    // ── ERC-20 (USDC) ────────────────────────────────────────────────────────
    sol! {
        interface IERC20 {
            function transferFrom(address from, address to, uint256 amount) external returns (bool);
            function transfer(address to, uint256 amount) external returns (bool);
            function approve(address spender, uint256 amount) external returns (bool);
            function balanceOf(address account) external view returns (uint256);
        }
    }

    // ── Eventos ───────────────────────────────────────────────────────────────

    sol! {
        event TreasuryInitialized(address indexed admin, address indexed usdc);
        event Deposit(
            address indexed account,
            uint256 assets,
            uint256 shares,
            uint256 total_assets,
            uint256 total_shares
        );
        event Redeem(
            address indexed account,
            address indexed to,
            uint256 shares,
            uint256 assets
        );
        event YieldRealized(uint256 added_assets, uint256 total_assets);
        event StrategyUpdated(address indexed old_strategy, address indexed new_strategy);
    }

    // ── Almacenamiento ────────────────────────────────────────────────────────

    #[storage]
    #[entrypoint]
    pub struct TreasuryVault {
        /// Cuenta administradora (SDD §7.3).
        pub owner: StorageAddress,
        /// Activo de rendimiento (USDC).
        pub usdc: StorageAddress,
        /// Estrategia externa (0x0 en MVP).
        pub strategy: StorageAddress,
        /// Activos bajo gestión en USDC (incluye rendimiento).
        pub total_assets: StorageU256,
        /// Participaciones en circulación.
        pub total_shares: StorageU256,
        /// Participaciones por tenedor (SDD §7.2: cada reto canjea exactamente las suyas).
        ///
        /// Sin este libro mayor, `total_shares` es un contador global y cualquiera puede
        /// canjear las participaciones de todos. Es la guarda que impide vaciar el vault.
        pub shares_of: StorageMap<Address, StorageU256>,
        /// Bloquea depósitos y canjes.
        pub paused: StorageBool,
    }

    // ── Helpers ────────────────────────────────────────────────────────────────

    impl TreasuryVault {
        fn usdc_balance(&self, token: Address, who: Address) -> U256 {
            let call = IERC20::balanceOfCall { account: who };
            let data = call.abi_encode();
            match call::static_call(self, token, &data) {
                Ok(out) => read_u256(&out),
                Err(_) => U256::ZERO,
            }
        }

        fn require_admin(&self) -> Result<(), Vec<u8>> {
            if msg::sender() != self.owner.get() {
                return Err(b"not_admin".to_vec());
            }
            Ok(())
        }

        fn require_not_paused(&self) -> Result<(), Vec<u8>> {
            if self.paused.get() {
                return Err(b"paused".to_vec());
            }
            Ok(())
        }
    }

    // ── Interfaz pública ──────────────────────────────────────────────────────

    #[public]
    impl TreasuryVault {
        /// Inicializador de una sola vez. Debe llamarse tras el deploy.
        pub fn init(&mut self, usdc: Address) -> Result<(), Vec<u8>> {
            if self.owner.get() != Address::ZERO {
                return Err(b"already_initialized".to_vec());
            }
            self.owner.set(msg::sender());
            self.usdc.set(usdc);
            self.total_assets.set(U256::ZERO);
            self.total_shares.set(U256::ZERO);
            self.paused.set(false);
            evm::log(TreasuryInitialized {
                admin: msg::sender(),
                usdc,
            });
            Ok(())
        }

        // ── Vault de participaciones (SDD §7.2) ────────────────────────────────

        /// Precio por participación: total_assets / total_shares (×1e18); 1e18 si vacío.
        pub fn price_per_share(&self) -> U256 {
            let shares = self.total_shares.get();
            if shares.is_zero() {
                return U256::from(1_000_000_000_000_000_000u128); // 1e18
            }
            (self.total_assets.get() * U256::from(1_000_000_000_000_000_000u128)) / shares
        }

        pub fn total_assets(&self) -> U256 {
            self.total_assets.get()
        }

        pub fn total_shares(&self) -> U256 {
            self.total_shares.get()
        }

        /// Participaciones que posee una cuenta. El `ChallengePool` las consulta para
        /// conciliar contra el `treasury_shares` que guarda por reto.
        pub fn shares_of(&self, account: Address) -> U256 {
            self.shares_of.get(account)
        }

        /// Emite participaciones por USDC depositados. CEI: contabilidad antes del
        /// transfer; el llamador debe haber aprobado al vault.
        pub fn deposit(&mut self, assets: U256) -> Result<U256, Vec<u8>> {
            self.require_not_paused()?;
            if assets.is_zero() {
                return Err(b"zero_assets".to_vec());
            }

            let price = self.price_per_share();
            let total = self.total_assets.get();
            let shares = if total.is_zero() {
                assets
            } else {
                (assets * U256::from(1_000_000_000_000_000_000u128)) / price
            };

            self.total_assets.set(total + assets);
            let new_shares = self.total_shares.get() + shares;
            self.total_shares.set(new_shares);

            // Acreditar las participaciones a quien deposita. `redeem_shares` solo puede
            // quemar contra este saldo, nunca contra el total global.
            let holder = msg::sender();
            let holder_shares = self.shares_of.get(holder) + shares;
            self.shares_of.setter(holder).set(holder_shares);

            // Mover USDC desde el depositante.
            let usdc = self.usdc.get();
            let data = IERC20::transferFromCall {
                from: msg::sender(),
                to: contract::address(),
                amount: assets,
            }
            .abi_encode();
            call::call(&mut *self, usdc, &data).map_err(|_| b"transferFrom_failed".to_vec())?;

            // Verificar el movimiento (robusto a variantes USDC sin bool).
            let got = self.usdc_balance(usdc, contract::address());
            if got < assets {
                return Err(b"usdc_not_transferred".to_vec());
            }

            evm::log(Deposit {
                account: msg::sender(),
                assets,
                shares,
                total_assets: total + assets,
                total_shares: new_shares,
            });
            Ok(shares)
        }

        /// Quema shares del llamador y devuelve los USDC equivalentes.
        /// CEI: contabilidad antes del transfer.
        ///
        /// Solo se pueden quemar participaciones que el llamador posea (`shares_of`). Esto es
        /// lo que impide que un tercero vacíe el vault: antes, la única guarda era contra
        /// `total_shares` global, así que cualquiera podía canjear el capital de todos los
        /// retos activos en una sola transacción.
        pub fn redeem_shares(&mut self, shares: U256, to: Address) -> Result<U256, Vec<u8>> {
            self.require_not_paused()?;
            if shares.is_zero() {
                return Err(b"zero_shares".to_vec());
            }
            let holder = msg::sender();
            let holder_shares = self.shares_of.get(holder);
            if shares > holder_shares {
                return Err(b"insufficient_shares".to_vec());
            }
            let current_shares = self.total_shares.get();
            if shares > current_shares {
                return Err(b"insufficient_total_shares".to_vec());
            }
            if to == Address::ZERO {
                return Err(b"zero_to".to_vec());
            }
            let price = self.price_per_share();
            let assets = (shares * price) / U256::from(1_000_000_000_000_000_000u128);

            self.total_shares.set(current_shares - shares);
            self.shares_of.setter(holder).set(holder_shares - shares);
            let new_assets = self.total_assets.get().saturating_sub(assets);
            self.total_assets.set(new_assets);

            // Pagar USDC a `to`.
            let usdc = self.usdc.get();
            let call = IERC20::transferCall { to, amount: assets }.abi_encode();
            call::call(&mut *self, usdc, &call).map_err(|_| b"transfer_failed".to_vec())?;

            evm::log(Redeem {
                account: msg::sender(),
                to,
                shares,
                assets,
            });
            Ok(assets)
        }

        // ── Estrategia de rendimiento (SDD §7.3) ───────────────────────────────

        /// Modela el rendimiento: aumenta total_assets sin emitir shares. Solo admin.
        pub fn realize_yield(&mut self, added_assets: U256) -> Result<(), Vec<u8>> {
            self.require_admin()?;
            if added_assets.is_zero() {
                return Ok(());
            }
            let new_total = self.total_assets.get() + added_assets;
            self.total_assets.set(new_total);
            evm::log(YieldRealized {
                added_assets,
                total_assets: new_total,
            });
            Ok(())
        }

        /// Designa la estrategia activa. Solo admin (SDD §7.3).
        pub fn set_strategy(&mut self, strategy: Address) -> Result<(), Vec<u8>> {
            self.require_admin()?;
            let old = self.strategy.get();
            self.strategy.set(strategy);
            evm::log(StrategyUpdated {
                old_strategy: old,
                new_strategy: strategy,
            });
            Ok(())
        }

        /// Pausa el flujo de depósitos y canjes. Solo admin.
        pub fn set_paused(&mut self, paused: bool) -> Result<(), Vec<u8>> {
            self.require_admin()?;
            self.paused.set(paused);
            Ok(())
        }

        // ── Lectura ──────────────────────────────────────────────────────────

        pub fn strategy(&self) -> Address {
            self.strategy.get()
        }

        pub fn usdc(&self) -> Address {
            self.usdc.get()
        }
    }

    fn read_u256(data: &[u8]) -> U256 {
        if data.len() < 32 {
            return U256::ZERO;
        }
        U256::from_be_slice(&data[..32])
    }
}
