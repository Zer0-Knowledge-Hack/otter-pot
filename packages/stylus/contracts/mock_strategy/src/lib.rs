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

    sol! {
        interface IERC20 {
            function transferFrom(address from, address to, uint256 amount) external returns (bool);
            function transfer(address to, uint256 amount) external returns (bool);
            function balanceOf(address account) external view returns (uint256);
        }
    }

    sol! {
        event MockStrategyInitialized(address indexed owner, address indexed usdc);
        event VaultSet(address indexed vault);
        event Minted(uint256 amount);
    }

    #[storage]
    #[entrypoint]
    pub struct MockStrategy {
        pub initialized: StorageBool,
        pub owner: StorageAddress,
        pub vault: StorageAddress,
        pub usdc: StorageAddress,
    }

    impl MockStrategy {
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

        fn usdc_balance(&self) -> U256 {
            let call = IERC20::balanceOfCall {
                account: contract::address(),
            };
            let data = call.abi_encode();
            match call::static_call(self, self.usdc.get(), &data) {
                Ok(out) => read_u256(&out),
                Err(_) => U256::ZERO,
            }
        }
    }

    #[public]
    impl MockStrategy {
        /// Inicializador de una sola vez. El llamador pasa a ser el owner.
        pub fn init(&mut self, usdc: Address) -> Result<(), Vec<u8>> {
            if self.initialized.get() {
                return Err(b"already_initialized".to_vec());
            }
            if usdc == Address::ZERO {
                return Err(b"invalid_address".to_vec());
            }
            self.initialized.set(true);
            self.owner.set(msg::sender());
            self.usdc.set(usdc);
            evm::log(MockStrategyInitialized {
                owner: msg::sender(),
                usdc,
            });
            Ok(())
        }

        /// Autoriza al vault para depositar/retirar. Solo owner.
        pub fn set_vault(&mut self, vault: Address) -> Result<(), Vec<u8>> {
            self.require_owner()?;
            if vault == Address::ZERO {
                return Err(b"invalid_address".to_vec());
            }
            self.vault.set(vault);
            evm::log(VaultSet { vault });
            Ok(())
        }

        /// Retiene USDC del vault en el mock. Solo vault.
        pub fn deposit(&mut self, amount: U256) -> Result<(), Vec<u8>> {
            self.require_vault()?;
            if amount.is_zero() {
                return Ok(());
            }
            let data = IERC20::transferFromCall {
                from: msg::sender(),
                to: contract::address(),
                amount,
            }
            .abi_encode();
            let usdc = self.usdc.get();
            call::call(&mut *self, usdc, &data).map_err(|_| b"transferFrom_failed".to_vec())?;
            Ok(())
        }

        /// Devuelve USDC al vault. Solo vault.
        pub fn withdraw(&mut self, amount: U256) -> Result<U256, Vec<u8>> {
            self.require_vault()?;
            if amount.is_zero() {
                return Ok(U256::ZERO);
            }
            let got = self.usdc_balance();
            if got < amount {
                return Err(b"insufficient_assets".to_vec());
            }
            let data = IERC20::transferCall {
                to: msg::sender(),
                amount,
            }
            .abi_encode();
            let usdc = self.usdc.get();
            call::call(&mut *self, usdc, &data).map_err(|_| b"transfer_failed".to_vec())?;
            Ok(amount)
        }

        /// USDC retenido en el mock. El yield es la USDC acuñada adicionalmente.
        pub fn balance_of(&self) -> U256 {
            self.usdc_balance()
        }

        /// Alias de `balanceOf`.
        pub fn total_assets(&self) -> U256 {
            self.usdc_balance()
        }

        /// Acuña USDC extra en el mock para simular rendimiento. Solo owner.
        pub fn mint(&mut self, amount: U256) -> Result<(), Vec<u8>> {
            self.require_owner()?;
            if amount.is_zero() {
                return Ok(());
            }
            let usdc = self.usdc.get();
            let me = contract::address();
            let data = IERC20::transferFromCall {
                from: msg::sender(),
                to: me,
                amount,
            }
            .abi_encode();
            call::call(&mut *self, usdc, &data).map_err(|_| b"transferFrom_failed".to_vec())?;
            evm::log(Minted { amount });
            Ok(())
        }
    }

    fn read_u256(data: &[u8]) -> U256 {
        if data.len() < 32 {
            return U256::ZERO;
        }
        U256::from_be_slice(&data[..32])
    }
}
