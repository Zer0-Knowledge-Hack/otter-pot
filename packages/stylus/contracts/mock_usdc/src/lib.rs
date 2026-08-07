// Mock ERC-20 (USDC, 6 decimals) para el devnode local.
// No es el USDC real (0xaf88…e5831) — en el Nitro devnode ese contrato no existe.
// Existe SOLO para pruebas locales: mintea a voluntad para fondear participantes.
#![cfg_attr(all(target_arch = "wasm32", not(feature = "export-abi")), no_main)]

#[cfg(target_arch = "wasm32")]
extern crate alloc;

#[cfg(target_arch = "wasm32")]
pub mod contract {
    use alloc::string::String;
    use alloy_primitives::{Address, U256};
    use alloy_sol_types::sol;
    use stylus_sdk::storage::{
        StorageAddress, StorageBool, StorageMap, StorageString, StorageU256,
    };
    use stylus_sdk::{evm, msg, prelude::*};

    sol! {
        event Transfer(address indexed from, address indexed to, uint256 value);
        event Approval(address indexed owner, address indexed spender, uint256 value);
    }

    #[storage]
    #[entrypoint]
    pub struct MockUsdc {
        pub initialized: StorageBool,
        pub owner: StorageAddress,
        pub name: StorageString,
        pub symbol: StorageString,
        pub decimals: StorageU256,
        pub total_supply: StorageU256,
        pub balances: StorageMap<Address, StorageU256>,
        pub allowances: StorageMap<Address, StorageMap<Address, StorageU256>>,
    }

    impl MockUsdc {
        fn require_owner(&self) -> Result<(), Vec<u8>> {
            if msg::sender() != self.owner.get() {
                return Err(b"not_owner".to_vec());
            }
            Ok(())
        }

        fn mint_internal(&mut self, to: Address, amount: U256) -> Result<(), Vec<u8>> {
            if to == Address::ZERO {
                return Err(b"mint_to_zero".to_vec());
            }
            if amount.is_zero() {
                return Err(b"zero_amount".to_vec());
            }
            let new_balance = self.balances.get(to) + amount;
            self.balances.setter(to).set(new_balance);
            self.total_supply.set(self.total_supply.get() + amount);
            evm::log(Transfer {
                from: Address::ZERO,
                to,
                value: amount,
            });
            Ok(())
        }
    }

    #[public]
    impl MockUsdc {
        /// Inicializador de una sola vez.
        pub fn init(
            &mut self,
            name: String,
            symbol: String,
            decimals: U256,
        ) -> Result<(), Vec<u8>> {
            if self.initialized.get() {
                return Err(b"already_initialized".to_vec());
            }
            self.initialized.set(true);
            self.owner.set(msg::sender());
            self.name.set_str(&name);
            self.symbol.set_str(&symbol);
            self.decimals.set(decimals);
            self.total_supply.set(U256::ZERO);
            Ok(())
        }

        // ── ERC-20 ──────────────────────────────────────────────────────────

        pub fn name(&self) -> String {
            self.name.get_string()
        }

        pub fn symbol(&self) -> String {
            self.symbol.get_string()
        }

        pub fn decimals(&self) -> U256 {
            self.decimals.get()
        }

        pub fn total_supply(&self) -> U256 {
            self.total_supply.get()
        }

        pub fn balance_of(&self, account: Address) -> U256 {
            self.balances.get(account)
        }

        pub fn allowance(&self, owner: Address, spender: Address) -> U256 {
            self.allowances.get(owner).get(spender)
        }

        pub fn transfer(&mut self, to: Address, amount: U256) -> Result<bool, Vec<u8>> {
            let from = msg::sender();
            let from_balance = self.balances.get(from);
            if from_balance < amount {
                return Err(b"insufficient_balance".to_vec());
            }
            if to == Address::ZERO {
                return Err(b"transfer_to_zero".to_vec());
            }
            self.balances.setter(from).set(from_balance - amount);
            let to_balance = self.balances.get(to);
            self.balances.setter(to).set(to_balance + amount);
            evm::log(Transfer {
                from,
                to,
                value: amount,
            });
            Ok(true)
        }

        pub fn approve(&mut self, spender: Address, amount: U256) -> Result<bool, Vec<u8>> {
            self.allowances
                .setter(msg::sender())
                .setter(spender)
                .set(amount);
            evm::log(Approval {
                owner: msg::sender(),
                spender,
                value: amount,
            });
            Ok(true)
        }

        pub fn transfer_from(
            &mut self,
            from: Address,
            to: Address,
            amount: U256,
        ) -> Result<bool, Vec<u8>> {
            let allowed = self.allowances.get(from).get(msg::sender());
            if allowed < amount {
                return Err(b"insufficient_allowance".to_vec());
            }
            let from_balance = self.balances.get(from);
            if from_balance < amount {
                return Err(b"insufficient_balance".to_vec());
            }
            self.allowances
                .setter(from)
                .setter(msg::sender())
                .set(allowed - amount);
            self.balances.setter(from).set(from_balance - amount);
            let to_balance = self.balances.get(to);
            self.balances.setter(to).set(to_balance + amount);
            evm::log(Transfer {
                from,
                to,
                value: amount,
            });
            Ok(true)
        }

        // ── Mock helpers ────────────────────────────────────────────────────

        /// Mintea `amount` al contrato llamador. Solo para pruebas.
        pub fn mint(&mut self, to: Address, amount: U256) -> Result<bool, Vec<u8>> {
            self.mint_internal(to, amount)?;
            Ok(true)
        }
    }
}
