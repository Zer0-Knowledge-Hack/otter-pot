## Context

`TreasuryVault` (`packages/stylus/contracts/treasury_vault/src/lib.rs`) es hoy un vault de participaciones sobre USDC con `strategy` fijada en `0x0` y `realize_yield(added_assets)` modelando el rendimiento como un valor inyectado por el admin. El vault retiene USDC ociosos en sí mismo; `ChallengePool` deposita/canjea participaciones vía `ITreasuryVault::deposit/redeemShares`. Ver proposal.md "Why" para la motivación.

Restricciones que condicionan el diseño:
- Stylus usa un único `#[entrypoint]` por crate, así que el adaptador (cuyo `address` debe persistirse en `strategy` para el patrón intercambiable) tiene que ser un contrato aparte y deployable, no un módulo del vault.
- El vault ya habla con contratos externos vía `sol!` + `call::call`, patrón a reutilizar para `IStrategy` (igual que hace con el mock USDC y con `ITreasuryVault` desde `ChallengePool`).
- El ABI on-chain cameliza nombres (`realizeYield`, `setStrategy`, ...) — ver SDD §6.6.
- No debe romperse el flujo existente del `ChallengePool`: `redeemShares(shares, to)` debe seguir pagando el total en USDC aunque los fondos estén desplegados en la estrategia.

## Goals / Non-Goals

**Goals:**
- Introducir la interfaz `IStrategy` y usarla para que el vault desplegue/retire capital a través exactamente del adaptador activo.
- Implementar un adaptador Aave V3 deployable para Arbitrum Sepolia.
- Acreditar rendimiento real leyendo `IStrategy.balanceOf()` (no un monto arbitrario).
- Gobernanza por admin que puede ceder el rol a una multisig (dos pasos) y pausar durante la migración.

**Non-Goals:**
- Autonomía adaptador-by-adaptador: las estrategias solo se cambian manualmente por admin, nunca automáticamente por tasa (SDD §7.3). Fuera de alcance un keeper/oracle de tasas.
- Manejo de pérdidas (reconciliación **a la baja** de `total_assets`). En MVP solo se acreditan deltas positivos; la devaluación de un mercado se documenta como limitación (ver Riesgos).
- Integración económica con otros protocolos de rendimiento además de Aave V3 en este cambio.
- Migración automática de fondos dentro de `setStrategy`; la migración es un procedimiento admin con pausa (requisito `Strategy migration under pause`).

## Decisions

### D1. `IStrategy` como interfaz `sol!` y helper de llamada en el vault

Definir en `treasury_vault/src/contract/strategy/mod.rs`, usado con `call::call`:

```
sol! {
    interface IStrategy {
        function deposit(uint256 amount) external;
        function withdraw(uint256 amount) external returns (uint256);
        function balanceOf() external view returns (uint256);
        function totalAssets() external view returns (uint256);
    }
}
```

El vault solo conoce este contrato; cualquier protocolo (Aave, Compound, ...) se torna disponible escribiendo un nuevo adaptador.
*Alternativa descartada:* que el vault llame directamente al Pool de Aave — rompe el patrón de adaptador intercambiable de SDD §7.3.

### D2. Adaptador como crate Stylus aparte (`contracts/aave_strategy`)

Nueva crate deployable que implementa `deposit/withdraw/balanceOf/totalAssets` contra Aave V3 (Arbitrum Sepolia Pool `0xBfC91D59fdAA134A4ED45f7B584cAf96D7792Eff`). Almacenamiento: `owner`, `vault`, `pool`, `usdc`, `atoken`.
- `init(pool, usdc, atoken)`: una sola vez; el adquirente pasa a ser `owner`.
- `set_vault(vault)`: solo owner; autoriza al vault para `deposit/withdraw`.
- `deposit(amount)`: solo vault → `transferFrom(vault, adapter, amount)`; `approve(pool, amount)`; `pool.supply(usdc, amount, adapter, 0)`.
- `withdraw(amount)`: solo vault → `pool.withdraw(usdc, amount, adapter)` → `transfer(usdc, vault, recibido)`.
- `balanceOf()/totalAssets()`: `IERC20.balanceOf(adapter)` sobre el `atoken` almacenado (aUSDC ~1:1 en USDC, incluye interés acumulado).

Nota: en Stylus el call a `supply`/`withdraw` de Aave se hace mediante `sol!` de la interfaz del Pool (`supply(address,uint256,address,uint16)` y `withdraw(address,uint256,address)`); el `referralCode` se fija en `0`.
- Alternativa: que el vault emitiera el Aave Pool — mismo motivo que D1.

### D3. TreasuryVault: desplegar/retirar capital vía estrategia

Nuevas funciones admin (no gateadas por `paused` — son parte de la migración):
- `deploy_to_strategy(amount)`: `require_admin`; `amount <= usdc.balanceOf(vault)` (idle); llama `IStrategy.deposit(amount)`; si `strategy.balanceOf()` no crece, revert. No toca `total_assets` (ya estaba contabilizado como activo). Emite `StrategyDeployed`.
- `withdraw_from_strategy(amount)`: `require_admin`; llama `IStrategy.withdraw(amount)`; verifica que el USDC regrese al vault; actualiza `strategy_deployed`. Emite `StrategyWithdrawn`.
- `withdraw_all_from_strategy()`: admin; `amount = IStrategy.balanceOf()`; usa `withdraw_from_strategy(amount)`. Conveniencia para la migración (requisito `Strategy migration under pause`).

Estado nuevo: `strategy_deployed: StorageU256` (último valor medido en la estrategia, en USDC).

### D4. `realize_yield()` sin argumento que lee la estrategia — BREAKING

Firma pasa de `realize_yield(added_assets: U256)` a `realize_yield()` (ABI `realizeYield()`); admin-only. Lee `strategy.balanceOf()`; si `balance > strategy_deployed`, acredita el delta en `total_assets` y actualiza `strategy_deployed`. Con `strategy == 0x0`, no-op.
- **A favor:** coincide con los requisitos de la spec `Yield realization` y elimina el input arbitrario (riesgo de inflación de `price_per_share`).
- **En contra:** cambia firma. El Worker no la usa (verificado); se actualizan `txhistory.ts` y `integration-test-usdc.ts`, y SDD §6.6 marca el ABI nuevo.
- Alternativa: mantener el parámetro ignorándolo — confuso y oculta intención; descartada.
- Alternativa: añadir `reconcile_strategy()` y conservar `realize_yield` — la spec impone medir desde la estrategia; una segunda función conduce a dos caminos de rendimiento. Descartada.

### D5. Gobernanza: admin y dos-pasos para multisig

`owner` sigue siendo el admin (SDD §7.3.4 — "cuenta administradora multifirma del equipo"). Como puede ser una EOA o un Safe, se añade transferencia en dos pasos para poder ceder el botón a una multisig sin re-deploy:
- `transfer_ownership(new_owner)`: admin; fija `pending_owner`; emite `OwnershipTransferStarted`.
- `accept_ownership()`: solo `msg.sender == pending_owner`; `owner = pending_owner`, limpia `pending_owner`; emite `OwnershipTransferred`.
- `set_strategy`, `set_paused`, `deploy_to_strategy`, `withdraw_from_strategy`, `realize_yield` siguen `require_admin`.
- Alternativa:gobernanza on-chain con roles tipo Safe en el propio contrato — no necesario para MVP; el Safe es agnóstico y externo.

### D6. Pausa durante migración

`set_paused` (admin) ya existe y bloquea `deposit`/`redeem`. `deploy_to_strategy`/`withdraw_from_strategy` **no** quedan bloqueadas por pausa (son admin y necesarias durante la ventana de migración). Flujo documentado en SDD §7.3:
1. `set_paused(true)`
2. `withdraw_all_from_strategy()`
3. `set_strategy(nueva)`
4. `deploy_to_strategy(idle)`
5. `set_paused(false)`

### D7. Redención con saldo inactivo insuficiente

`redeem_shares` debe seguir funcionando aunque el USDC esté en la estrategia: si `usdc.balanceOf(vault) < assets`, se llama `IStrategy.withdraw(shortfall)` antes de transferir. Garantiza disponibilidad de fondos (SDD §13, requisito `Redeem when idle balance is insufficient`).
- Riesgo de reentrada: por CEI se ajusta contabilidad antes de cualquier llamada externa (patrón ya presente).

### D8. Testing

- **Rust (`cargo test`)**: helpers puros de contabilidad (cálculo de delta, validación de `deploy <= idle`, etc.).
- **Local determinista (TS)**: crate `contracts/mock_strategy` (similar a `mock_usdc`) que mantiene USDC y `balanceOf = usdc.balanceOf(adapter)`; para simular yield, el admin acuña USDC extra al mock y `realizeYield()` lo acredita. Se cubre el ecosistema vault+adaptador en el test de integración sin depender de la red real.
- **Arbitrum Sepolia (opcional por tiempo)**: test de humo contra el Pool real con un monto pequeño financiado (faucet) que hace supply→obtener aUSDC→withdraw.

## Risks / Trade-offs

- [Inflación de `price_per_share` por yield arbitrario] → se elimina la entrada manual; `realize_yield()` mide desde `strategy.balanceOf()`.
- **[Pérdida de la estrategia no reconciliada a la baja]** → en MVP `total_assets` solo se acredita al alza; se documenta como limitación y no conduce a saques pasivos por debajo de lo desplegado (el vault nunca promete más de lo verificado). Con el mock y el path real de prueba el comportamiento es determinista.
- **[Riesgo del protocolo Aave] (contrato, depeg, rug) — ampliación de la superficie de auditoría** → el adaptador solo puede mover `usdc` del vault; cambiar de estrategia requiere gobernanza por multidis; se documenta en SDD §11.
- **[Break ABI `realizeYield()`]** → no consumido por Worker; scripts internos actualizados; SDD §6.6 actualizada.
- **[Slippage/fallo de withdraw en fondos deployados al redimir]** → revert del redee protege al usuario (el vault no paga parte); el procedimiento operativo mantiene idle suficiente o drena antes.
- **Floor de gas de calls cross-contract adicionales (deploy/withdraw/redeem)** → limitado y aceptable para el MVP; medir en `cargo stylus deploy` de prueba.

## Migration Plan

Contratos son nuevos/de actualización en el mismo deploy:
1. Deploy `aave_strategy` (init pool+usdc) y `set_vault(vault)`.
2. Deploy/actualizar `TreasuryVault` y `set_strategy(adapter)`.
3. `deploy_to_strategy(idle)` tras `set_paused(false)` (no hay fondos viejos que migrar aún).
Procedimiento futuro de cambio de estrategia: pausa → drenar → `set_strategy` → desplegar → unpausar (D6).
Rollback: `withdraw_all_from_strategy()` regresa los fondos al vault; `set_strategy(zero)` + `set_paused(true)` vuelve al estado MVP (sin rendimiento en cadena).