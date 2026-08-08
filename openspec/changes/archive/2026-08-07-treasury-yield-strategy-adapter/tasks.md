## 1. Interfaz `IStrategy` y llamadas desde el vault

- [x] 1.1 Crear `packages/stylus/contracts/treasury_vault/src/contract/strategy/mod.rs` con la interfaz `sol!` `IStrategy` (`deposit(uint256)`, `withdraw(uint256) returns (uint256)`, `balanceOf() returns (uint256)`, `totalAssets() returns (uint256)`).
- [x] 1.2 Añadir `mod strategy;` en `treasury_vault/src/lib.rs` y helpers de llamada cross-contract (`strategy_deposit`, `strategy_withdraw`, `strategy_balance_of`) reutilizando `call::call` / `call::static_call`, sin `unwrap()` en rutas que manejan fondos.

## 2. Adaptador Aave V3 (crate `aave_strategy`)

- [x] 2.1 Crear el crate `packages/stylus/contracts/aave_strategy/` (Cargo.toml, Stylus.toml, src/lib.rs, src/main.rs) siguiendo la estructura de `treasury_vault`.
- [x] 2.2 Implementar almacenamiento `owner`, `vault`, `pool`, `usdc`, `atoken`, con `init(pool, usdc, atoken)` de una sola vez y `set_vault(vault)` solo depende del owner.
- [x] 2.3 Implementar `deposit(amount)` (solo vault): `transferFrom(vault → adapter, amount)`, `approve(pool)`, `pool.supply(usdc, amount, adapter, referralCode=0)`; verificar el saldo aUSDC resultante.
- [x] 2.4 Implementar `withdraw(amount)` (solo vault): `pool.withdraw(usdc, amount, adapter)` y transferir el USDC recibido al vault.
- [x] 2.5 Implementar `balanceOf()` / `totalAssets()` leyendo `IERC20.balanceOf(adapter)` sobre el `atoken` almacenado (aUSDC ~1:1 en USDC, 6 decimales).

## 3. Adaptador de mock (testing local)

- [x] 3.1 Crear crate `packages/stylus/contracts/mock_strategy/` (análogo a `mock_usdc`): almacena `owner`, `vault`, `usdc`; `init(usdc)` de una vez; `set_vault(vault)` solo owner.
- [x] 3.2 Implementar `deposit(amount)` (transfiere USDC del vault al mock), `withdraw(amount)` (devuelve al vault), `balanceOf()` / `totalAssets()` = `usdc.balanceOf(mock)`, y `mint(amount)` (owner acuña USDC al mock) para simular rendimiento.

## 4. Integración de `TreasuryVault` con el adaptador

- [x] 4.1 Añadir estado `strategy_deployed: StorageU256` y `pending_owner: StorageAddress`; eventos `StrategyDeployed`, `StrategyWithdrawn`, `OwnershipTransferStarted`, `OwnershipTransferred`.
- [x] 4.2 Implementar `deploy_to_strategy(amount)` (admin): validar `amount <= usdc.balanceOf(vault)`, llamar `IStrategy.deposit`, verificar crecimiento de `balanceOf()`, actualizar `strategy_deployed`.
- [x] 4.3 Implementar `withdraw_from_strategy(amount)` y `withdraw_all_from_strategy()` (admin): llamar `IStrategy.withdraw`, verificar que el USDC regresa al vault, restar `strategy_deployed`.
- [x] 4.4 Reescribir `realize_yield()` a sin argumento (ABI `realizeYield()`): leer `strategy.balanceOf()`, acreditar el delta > 0 a `total_assets`, actualizar `strategy_deployed`; no-op si `strategy == 0x0`. **[BREAKING ABI]**
- [x] 4.5 Modificar `redeem_shares`: si `usdc.balanceOf(vault) < assets`, llamar `IStrategy.withdraw(shortfall)` antes de transferir (requisito `Redeem when idle balance is insufficient`); mantener CEI.
- [x] 4.6 Implementar gobernanza en dos pasos `transfer_ownership(new_owner)` (admin, fija `pending_owner`, emite el evento) y `accept_ownership()` (solo `msg.sender == pending_owner`, actualiza `owner`).

## 5. Pruebas

- [x] 5.1 Tests unitarios Rust (`cargo test`): helpers de yield, límite `deploy <= idle`, cálculo de shortfall, permisos de admin/vault, transferencia de ownership en dos pasos, pausa de migración.
- [x] 5.2 Ampliar `scripts/integration-test-usdc.ts` usando `mock_strategy`: cubrir ciclo depositar → yield (mint) → redeem con shortfall, y migración con pausa.
- [x] 5.3 Test de humo opcional en Arbitrum Sepolia contra el adaptador real (crate `aave_strategy`): supply → obtener aUSDC → withdraw con un monto pequeño financiado.

## 6. Scripts de operación

- [x] 6.1 Actualizar `scripts/deploy.ts` / `scripts/setup-contracts.ts` para desplegar el adaptador (`mock_strategy` en local, `aave_strategy` en Sepolia), llamar `set_vault(vault)` y cablear `set_strategy` según entorno.
- [x] 6.2 Añadir `scripts/set-strategy.ts` que lee la dirección de deployment y llama `setStrategy` desde la wallet owner.
- [x] 6.3 Actualizar `scripts/txhistory.ts` y `scripts/integration-test-usdc.ts` a la firma `realizeYield()` sin argumento.

## 7. Documentación

- [x] 7.1 Actualizar `docs/SDD.md` §7.2/§7.3: gobernanza admin/multisig con transferencia en dos pasos, dirección del Aave V3 Pool en Sepolia, flujo de migración con pausa, e interfaz `IStrategy`.
- [x] 7.2 Actualizar `docs/SDD.md` §6.6 para listar las funciones ABI nuevas (`deployToStrategy`, `withdrawFromStrategy`, `withdrawAllFromStrategy`, `transferOwnership`, `acceptOwnership`) y `realizeYield()` sin argumento.

## 8. Verificación

- [x] 8.1 Ejecutar `cargo fmt`, `cargo clippy`, `cargo stylus check` y `cargo test` en `treasury_vault`, `aave_strategy` y `mock_strategy`.
- [x] 8.2 Ejecutar `cargo stylus export-abi` para `treasury_vault` y `aave_strategy` y confirmar que el Worker/Mini App pueden leer las funciones nuevas.