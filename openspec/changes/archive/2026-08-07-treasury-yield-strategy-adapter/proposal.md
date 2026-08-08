## Why

`TreasuryVault` hoy es un vault de participaciones que retiene USDC ociosos en el propio contrato: `strategy` es un placeholder `0x0` y el rendimiento se modela con `realize_yield(addedAssets)`, un valor inyectado arbitrariamente por el admin (SDD §7.3, §7.4). El dinero agregado de todos los retos no genera rendimiento real. Este cambio conecta la Tesorería con un protocolo de rendimiento externo (Aave V3) a través de un adaptador intercambiable, cumpliendo SDD §7.2/§7.3: el pozo común crece con rendimiento medible en USDC, mientras el cambio de estrategia queda gobernado por una cuenta administradora (o una multisig) y protegido por pausa durante la migración.

## What Changes

- **Introducir la interfaz `IStrategy`** (`deposit`, `withdraw`, `balanceOf`, `totalAssets`) que el vault usa para hablar con cualquier protocolo de rendimiento sin conocer su implementación.
- **Implementar un adaptador on-chain para Aave V3 en Arbitrum Sepolia** (Pool `0xBfC91D59fAA134A4ED45f7B584cAf96D7792Eff`): `deposit` hace `Pool.supply(USDC, amount, address(this), 0)`, `withdraw` hace `Pool.withdraw(USDC, amount, address(this))`, `balanceOf`/`totalAssets` reportan el valor en USDC (aUSDC) bajo gestión.
- **Hacer que `TreasuryVault` use el adaptador**: funciones admin `deploy_to_strategy(amount)` y `withdraw_from_strategy(amount)` que mueven USDC ida y vuelta con la estrategia vía `IStrategy`; `realize_yield()` pasa a leer `IStrategy.balanceOf()` y acreditara el delta en `total_assets` en lugar de aceptar un monto arbitrario. **BREAKING**: `realizeYield` pierde su argumento `addedAssets` (pasa a `realizeYield()`); el Worker aún no lo usa y los scripts internos se actualizan.
- **Gobernanza**: el owner ya es el admin (SDD §7.3); se añade `transfer_ownership` en dos pasos para poder ceder el botón a una multisig (Safe) sin re-deploy.
- **Pausa durante migración**: `set_paused(bool)` ya existe; se documenta como el mecanismo para drenar/admitir la estrategia vieja, cambiar puntero y desplegar en la nueva.
- **Actualizar `docs/SDD.md` §7.3** para reflejar: admin puede ser EOA o multisig, dirección real del Pool Aave V3 en Sepolia, y el flujo de migración con pausa.

## Capabilities

### New Capabilities

- `aave-strategy-adapter`: Define el contrato adaptador on-chain que implementa `IStrategy` frente a Aave V3 (depositar/retirar USDC al/a del Pool, reportar valor en aUSDC) y su acotación solo-owner.

### Modified Capabilities

- `treasury-vault`: el vault pasa a desplegar/retirar el capital a través exactamente de la estrategia activa (no puede tocar Aave directamente); el rendimiento se acredita leyendo `IStrategy.balanceOf()` en lugar de un monto arbitrario; el administrador (EOA o multisig) puede cambiar la estrategia y pausar el vault durante la migración.

## Impact

- **Smart contract (`TreasuryVault`)**: nuevas funciones `deploy_to_strategy`, `withdraw_from_strategy`, `transfer_ownership`/`accept_ownership` (dos pasos); `realize_yield` re-trabada para leer la estrategia; nuevo `StrategyDeployed`/`StrategyWithdrawn`/`OwnershipTransferStarted`/`OwnershipTransferred` events (SDD §13: toda mutación emite evento).
- **Nuevo contrato (`aave_strategy`, crate aparte)**: adaptador Aave V3 deployable; `init(pool, usdc, atoken)`; solo-owner.
- **Scripts**: `deploy.ts`/`setup-contracts.ts` actualizados para desplegar adaptador y cablear `set_strategy`; script opcional `realize-yield.ts`.
- **Integración/testing**: test de integración con mock del adaptador en local (determinista) y path de prueba en Sepolia contra el Pool real.
- **Documentación**: `docs/SDD.md` §7.3 y §6.6 actualizados (gobernanza admin/multisig, dirección del Pool, flujo de pausa, nuevo ABI `realizeYield()`).
- **No breaking para el Worker/Mini App**: `setStrategy`, `setPaused`, `deployToStrategy`, `withdrawFromStrategy`, `transferOwnership`, `acceptOwnership` son aditivos; el único cambio de firma es `realizeYield()` (ver **BREAKING** arriba).