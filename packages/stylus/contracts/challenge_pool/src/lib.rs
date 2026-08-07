// `no_main` required for WASM builds, but not when testing/export-abi.
#![cfg_attr(all(target_arch = "wasm32", not(feature = "export-abi")), no_main)]

// `alloc` is a no_std dependency, only needed on WASM.
#[cfg(target_arch = "wasm32")]
extern crate alloc;

/// Pure business logic: no EVM calls, testable on native target.
pub mod logic;

// ── Contract code, compiled only on the wasm32 target ───────────────────────
#[cfg(target_arch = "wasm32")]
mod contract {
    use super::logic;
    use alloy_primitives::{Address, U256};
    use alloy_sol_types::{sol, SolCall};
    use logic::{
        refund_per_participant, resolve_payout, total_pool, validate_confirm_result,
        validate_deposit, validate_refund, STATE_ABIERTO, STATE_BLOQUEADO, STATE_REEMBOLSADO,
        STATE_RESUELTO,
    };
    use stylus_sdk::{
        call, contract, evm, msg,
        prelude::*,
        storage::{StorageAddress, StorageBool, StorageMap, StorageU256},
    };

    // ── Interfaces (USDC ERC-20 + TreasuryVault) ──────────────────────────────
    sol! {
        interface IERC20 {
            function transferFrom(address from, address to, uint256 amount) external returns (bool);
            function transfer(address to, uint256 amount) external returns (bool);
            function approve(address spender, uint256 amount) external returns (bool);
        }
        interface ITreasuryVault {
            function deposit(uint256 assets) external returns (uint256);
            function redeemShares(uint256 shares, address to) external returns (uint256);
        }
    }

    // ── On-chain events ───────────────────────────────────────────────────────

    sol! {
        event ChallengeCreated(
            uint256 indexed challenge_id,
            address indexed creator,
            uint256 required_deposit,
            uint256 deadline
        );
        event DepositReceived(
            uint256 indexed challenge_id,
            address indexed participant,
            uint256 amount
        );
        event ChallengeLocked(
            uint256 indexed challenge_id,
            uint256 treasury_shares
        );
        event ChallengeResolved(
            uint256 indexed challenge_id,
            address indexed winner,
            uint256 total_payout,
            uint256 commission
        );
        event ChallengeRefunded(
            uint256 indexed challenge_id,
            uint256 refund_per_participant
        );
        event RefundClaimed(
            uint256 indexed challenge_id,
            address indexed participant,
            uint256 amount
        );
        event OperatorAdded(address indexed operator);
        event OperatorRemoved(address indexed operator);
    }

    // ── Storage ───────────────────────────────────────────────────────────────

    #[storage]
    pub struct Challenge {
        pub creator: StorageAddress,
        pub required_deposit: StorageU256,
        pub deadline: StorageU256,
        pub status: StorageU256,
        pub winner: StorageAddress,
        pub treasury_shares: StorageU256,
        pub participant_count: StorageU256,
        pub deposited_count: StorageU256,
        pub participants: StorageMap<Address, StorageBool>,
        pub has_deposited: StorageMap<Address, StorageBool>,
        pub claimed_refund: StorageMap<Address, StorageBool>,
    }

    #[storage]
    #[entrypoint]
    pub struct ChallengePool {
        pub challenges: StorageMap<U256, Challenge>,
        pub next_challenge_id: StorageU256,
        pub treasury_vault: StorageAddress,
        /// USDC (ERC-20) portal approved by participants.
        pub usdc: StorageAddress,
        /// Authorized operators (Cloudflare Worker, SDD §9).
        pub operators: StorageMap<Address, StorageBool>,
        /// Commission rate in basis points (e.g. 500 = 5 %).
        pub base_commission_rate: StorageU256,
        /// Contract owner / admin.
        pub owner: StorageAddress,
    }

    // ── Private helpers ───────────────────────────────────────────────────────

    impl ChallengePool {
        fn require_operator(&self) -> Result<(), Vec<u8>> {
            if !self.operators.get(msg::sender()) {
                return Err(b"not_an_operator".to_vec());
            }
            Ok(())
        }

        fn require_owner(&self) -> Result<(), Vec<u8>> {
            if msg::sender() != self.owner.get() {
                return Err(b"not_owner".to_vec());
            }
            Ok(())
        }

        /// USDC transfer calldata.
        fn usdc_transfer(&self, to: Address, amount: U256) -> Vec<u8> {
            IERC20::transferCall { to, amount }.abi_encode()
        }

        fn usdc_transfer_from(&self, from: Address, to: Address, amount: U256) -> Vec<u8> {
            IERC20::transferFromCall { from, to, amount }.abi_encode()
        }

        fn usdc_approve(&self, spender: Address, amount: U256) -> Vec<u8> {
            IERC20::approveCall { spender, amount }.abi_encode()
        }
    }

    // ── Public interface ──────────────────────────────────────────────────────

    #[public]
    impl ChallengePool {
        // ── Admin / initialization ─────────────────────────────────────────

        /// One-shot initializer: sets owner, USDC, vault and commission rate.
        pub fn init(
            &mut self,
            treasury_vault: Address,
            usdc: Address,
            base_commission_rate: U256,
        ) -> Result<(), Vec<u8>> {
            if self.owner.get() != Address::ZERO {
                return Err(b"already_initialized".to_vec());
            }
            self.owner.set(msg::sender());
            self.treasury_vault.set(treasury_vault);
            self.usdc.set(usdc);
            self.base_commission_rate.set(base_commission_rate);
            Ok(())
        }

        pub fn add_operator(&mut self, operator: Address) -> Result<(), Vec<u8>> {
            self.require_owner()?;
            if operator == Address::ZERO {
                return Err(b"operator_is_zero".to_vec());
            }
            self.operators.setter(operator).set(true);
            evm::log(OperatorAdded { operator });
            Ok(())
        }

        pub fn remove_operator(&mut self, operator: Address) -> Result<(), Vec<u8>> {
            self.require_owner()?;
            self.operators.setter(operator).set(false);
            evm::log(OperatorRemoved { operator });
            Ok(())
        }

        pub fn set_commission_rate(&mut self, rate_bps: U256) -> Result<(), Vec<u8>> {
            self.require_owner()?;
            if rate_bps > U256::from(1_000u64) {
                return Err(b"rate_too_high".to_vec());
            }
            self.base_commission_rate.set(rate_bps);
            Ok(())
        }

        // ── Challenge lifecycle ────────────────────────────────────────────

        pub fn create_challenge(
            &mut self,
            required_deposit: U256,
            deadline: U256,
            participants_list: Vec<Address>,
        ) -> Result<U256, Vec<u8>> {
            if participants_list.is_empty() {
                return Err(b"no_participants".to_vec());
            }
            if required_deposit.is_zero() {
                return Err(b"zero_deposit".to_vec());
            }
            if required_deposit > U256::from(logic::MAX_DEPOSIT_WEI) {
                return Err(b"deposit_exceeds_maximum".to_vec());
            }

            let challenge_id = self.next_challenge_id.get();
            self.next_challenge_id.set(challenge_id + U256::from(1u8));

            {
                let mut ch = self.challenges.setter(challenge_id);
                ch.creator.set(msg::sender());
                ch.required_deposit.set(required_deposit);
                ch.deadline.set(deadline);
                ch.status.set(U256::from(STATE_ABIERTO));
                ch.participant_count
                    .set(U256::from(participants_list.len()));
                ch.deposited_count.set(U256::ZERO);

                for p in participants_list.iter() {
                    ch.participants.setter(*p).set(true);
                    ch.has_deposited.setter(*p).set(false);
                    ch.claimed_refund.setter(*p).set(false);
                }
            }

            evm::log(ChallengeCreated {
                challenge_id,
                creator: msg::sender(),
                required_deposit,
                deadline,
            });

            Ok(challenge_id)
        }

        /// Deposit USDC (approved to the pool) for a challenge. Non-payable.
        pub fn deposit(&mut self, challenge_id: U256) -> Result<(), Vec<u8>> {
            let sender = msg::sender();

            let (
                status,
                is_participant,
                already_deposited,
                required_deposit,
                deposited_count,
                participant_count,
            ) = {
                let ch = self.challenges.setter(challenge_id);
                (
                    u8::try_from(ch.status.get()).unwrap(),
                    ch.participants.get(sender),
                    ch.has_deposited.get(sender),
                    ch.required_deposit.get(),
                    ch.deposited_count.get(),
                    ch.participant_count.get(),
                )
            };

            validate_deposit(
                status,
                is_participant,
                already_deposited,
                required_deposit,
                required_deposit,
            )
            .map_err(|e| e.as_bytes().to_vec())?;

            // CEI: escribimos el estado antes de la llamada externa.
            let new_deposited = deposited_count + U256::from(1u8);
            {
                let mut ch = self.challenges.setter(challenge_id);
                ch.has_deposited.setter(sender).set(true);
                ch.deposited_count.set(new_deposited);

                evm::log(DepositReceived {
                    challenge_id,
                    participant: sender,
                    amount: required_deposit,
                });
            }

            // Pull USDC del participante al pool.
            let usdc = self.usdc.get();
            let data = self.usdc_transfer_from(sender, contract::address(), required_deposit);
            call::call(&mut *self, usdc, &data).map_err(|_| b"usdc_pull_failed".to_vec())?;

            // Todos financiaron: Bloqueado y fondos al vault (mint shares).
            if new_deposited == participant_count {
                let total = total_pool(required_deposit, participant_count);

                let approve = self.usdc_approve(self.treasury_vault.get(), total);
                call::call(&mut *self, usdc, &approve).map_err(|_| b"approve_failed".to_vec())?;

                let vault = self.treasury_vault.get();
                let dep = ITreasuryVault::depositCall { assets: total }.abi_encode();
                let out = call::call(&mut *self, vault, &dep)
                    .map_err(|_| b"vault_deposit_failed".to_vec())?;
                let shares = read_u256(&out);

                {
                    let mut ch = self.challenges.setter(challenge_id);
                    ch.status.set(U256::from(STATE_BLOQUEADO));
                    ch.treasury_shares.set(shares);

                    evm::log(ChallengeLocked {
                        challenge_id,
                        treasury_shares: shares,
                    });
                }
            }

            Ok(())
        }

        /// Operator-only: relay winner, redeem the vault, pay winner (CEI).
        pub fn confirm_result(
            &mut self,
            challenge_id: U256,
            winner: Address,
        ) -> Result<(), Vec<u8>> {
            self.require_operator()?;

            let (status, treasury_shares, winner_is_participant) = {
                let ch = self.challenges.setter(challenge_id);
                (
                    u8::try_from(ch.status.get()).unwrap(),
                    ch.treasury_shares.get(),
                    ch.participants.get(winner),
                )
            };

            // El ganador debe pertenecer al reto: el operador relaya una decisión, no la elige.
            validate_confirm_result(status, winner, winner_is_participant)
                .map_err(|e| e.as_bytes().to_vec())?;

            // CEI: estado terminal antes de la llamada externa.
            {
                let mut ch = self.challenges.setter(challenge_id);
                ch.status.set(U256::from(STATE_RESUELTO));
                ch.winner.set(winner);
            }

            // Redimir shares (capital + yield), comisión y pagar al ganador.
            let vault = self.treasury_vault.get();
            let rede = ITreasuryVault::redeemSharesCall {
                shares: treasury_shares,
                to: contract::address(),
            }
            .abi_encode();
            let out = call::call(&mut *self, vault, &rede)
                .map_err(|_| b"vault_redeem_failed".to_vec())?;
            let recovered = read_u256(&out);

            let rate = self.base_commission_rate.get();
            let (winner_payout, commission) = resolve_payout(recovered, rate);

            // Pagar USDC exclusivamente al ganador (SDD §11).
            let usdc = self.usdc.get();
            let pay = self.usdc_transfer(winner, winner_payout);
            call::call(&mut *self, usdc, &pay).map_err(|_| b"winner_payout_failed".to_vec())?;

            evm::log(ChallengeResolved {
                challenge_id,
                winner,
                total_payout: winner_payout,
                commission,
            });
            Ok(())
        }

        /// Permissionless refund after deadline without consensus; no commission (CEI).
        /// Redemption credits USDC to the pool; participants claim via `claim_refund`.
        pub fn refund(&mut self, challenge_id: U256) -> Result<(), Vec<u8>> {
            let (status, treasury_shares, participant_count, deadline) = {
                let ch = self.challenges.setter(challenge_id);
                (
                    u8::try_from(ch.status.get()).unwrap(),
                    ch.treasury_shares.get(),
                    ch.participant_count.get(),
                    ch.deadline.get(),
                )
            };

            let now = U256::from(stylus_sdk::block::timestamp());
            validate_refund(status, deadline, now).map_err(|e| e.as_bytes().to_vec())?;

            // CEI: Reembolsado antes de la llamada externa.
            {
                let mut ch = self.challenges.setter(challenge_id);
                ch.status.set(U256::from(STATE_REEMBOLSADO));
            }

            // Redimir shares del vault al pool.
            let vault = self.treasury_vault.get();
            let rede = ITreasuryVault::redeemSharesCall {
                shares: treasury_shares,
                to: contract::address(),
            }
            .abi_encode();
            let out = call::call(&mut *self, vault, &rede)
                .map_err(|_| b"vault_redeem_failed".to_vec())?;
            let recovered = read_u256(&out);

            let per_participant = refund_per_participant(recovered, participant_count);

            // Guardar reembolso proporcional por participante.
            {
                let mut ch = self.challenges.setter(challenge_id);
                ch.treasury_shares.set(per_participant);
            }

            evm::log(ChallengeRefunded {
                challenge_id,
                refund_per_participant: per_participant,
            });
            Ok(())
        }

        /// Permissionless proportional refund claim by a participant (CEI).
        pub fn claim_refund(&mut self, challenge_id: U256) -> Result<(), Vec<u8>> {
            let sender = msg::sender();
            let (status, per_participant, is_participant, already_claimed) = {
                let ch = self.challenges.setter(challenge_id);
                (
                    u8::try_from(ch.status.get()).unwrap(),
                    ch.treasury_shares.get(),
                    ch.participants.get(sender),
                    ch.claimed_refund.get(sender),
                )
            };

            if status != STATE_REEMBOLSADO {
                return Err(b"not_refunded".to_vec());
            }
            if !is_participant {
                return Err(b"not_a_participant".to_vec());
            }
            if already_claimed {
                return Err(b"already_claimed".to_vec());
            }

            let amount = per_participant;

            // Marcar como reclamado (CEI) y transferir USDC.
            {
                let mut ch = self.challenges.setter(challenge_id);
                ch.claimed_refund.setter(sender).set(true);
            }

            evm::log(RefundClaimed {
                challenge_id,
                participant: sender,
                amount,
            });

            // Pagar USDC al participante.
            let usdc = self.usdc.get();
            let pay = self.usdc_transfer(sender, amount);
            call::call(&mut *self, usdc, &pay).map_err(|_| b"refund_payout_failed".to_vec())?;

            Ok(())
        }

        // ── Read-only helpers ──────────────────────────────────────────────

        pub fn challenge_status(&self, challenge_id: U256) -> Result<u8, Vec<u8>> {
            Ok(u8::try_from(self.challenges.getter(challenge_id).status.get()).unwrap())
        }

        pub fn is_operator(&self, operator: Address) -> Result<bool, Vec<u8>> {
            Ok(self.operators.get(operator))
        }
    }

    fn read_u256(data: &[u8]) -> U256 {
        if data.len() < 32 {
            return U256::ZERO;
        }
        U256::from_be_slice(&data[..32])
    }
}

