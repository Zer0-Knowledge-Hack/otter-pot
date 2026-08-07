## Why

El módulo de Tesorería es el corazón del modelo económico de OtterPot (SDD §7): agrega el capital de todos los retos bloqueados, lo coloca en una estrategia de rendimiento externa y reparte el rendimiento de forma justa y verificable entre los retos mediante contabilidad por participaciones. Hoy el código existe pero de forma incompleta: `TreasuryVault` (`packages/stylus/contracts/treasury_vault/src/lib.rs`) lleva la contabilidad por participaciones (pricing, depósito de shares, redención) pero **no realiza transferencias reales de USDC** — `deposit`, `redeem_shares` y `realize_yield` sólo actualizan contabilidad (CEI) y dejan pendiente "la integración con USDC se completa en la fase de producción". Además `ChallengePool` no está integrado con el vault: en `lib.rs` simula la emisión de shares 1:1 (`ch.treasury_shares.set(shares)`) y usa `mock_yield()` en `logic.rs` para calcular el payout, en vez de depositar USDC real y canjear sus participaciones en el vault cuando resuelve o reembolsa (SDD §7.1, §6.5).

Este cambio implementa el módulo de Tesorería de punta a punta con movimiento real de USDC (ERC-20) y lo conecta con `ChallengePool` para el canje de participaciones al resolver/reembolsar, reemplazando el modelo de "mock yield" del MVP con la mecánica real de precios por participación definida en el SDD §7.2.

## What Changes

- **TreasuryVault** pasa de contabilidad-solo a mover USDC (ERC-20) real: `deposit()` transfiere USDC del llamador al vault mediante `transferFrom`, emite shares al precio vigente; `redeem_shares()` quema shares y distribuye los USDC equivalentes (pull-payment / transferencia directa). Se añade una interfaz ERC-20 mínima (`IERC20`) y se respeta el patrón CEI.
- **TreasuryVault** expone la integración del adaptador de estrategia (SDD §7.3): la estrategia `realize_yield` pasa a ser el punto de entrada para incremental el `total_assets` con rendimiento medible en USDC, restringido a admin/multifirma.
- **ChallengePool** se integra con el vault en el ciclo de vida del reto:
  - Al bloquear el reto (todos los participantes depositaron), el pool transfiere el total del pozo USDC al vault mediante `deposit()` y recibe sus `shares`, que almacena en `treasury_shares` y usa como saldo de participaciones acumulado (no como monto del pozo en UBI).
  - Al resolver (`confirm_result`), el pool canjea sus participaciones mediante `redeem_shares(treasury_shares)` y recibe USDC de vuelta (capital + rendimiento), sobre cuyo valor total aplica la comisión (SDD §8) y transfiere el remanente al ganador.
  - Al reembolsar (`refund`) sin comisión: el pool canjea sus participaciones y reparte USDC proporcionalmente entre los participantes.
- **Depósitos de usuario** en `ChallengePool.deposit` pasan a aceptar USDC, no moneda nativa: el usuario debe `approve` al contrato de Retos (requisito §6.5) y el contrato usa `transferFrom` para cobrar el pozo.
- Se actualiza `logic.rs` para que el payout real provenga del can de shares del vault (total_assets recibidos) y se elimine `mock_yield` del camino de resolución.

## Capabilities

### New Capabilities

- `treasury-vault`: Define la contabilidad por participaciones, el pricing, el depósito flatten spans resolution y el can de participaciones con movimiento real de USDC.

### Modified Capabilities

- `challenge-pool`: Reemplaza el flujo mock por la integración real con el vault en depósito/reducción, ajusta `deposit` a ERC-20 USDC vía `approve`/`transferFrom`, y conecta el canje de participaciones al resolver/reembolsar.

## Impact

- **Contratos (Stylus):** Reescribe la lógica de movimiento de fondos en `TreasuryVault` y `ChallengePool`; afecta `price_per_share`, `deposit`, `redeem_shares`, `realize_yield` y el ciclo de vida del reto.
- **Seguridad:** Modifica sustancialmente la superficie de manejo de fondos de usuario. Se refuerza CEI, `transferFrom`/`approve`, control estricto de la dirección de retiro (sólo el ganador calculado) y gobernanza de estrategia restringida a admin (SDD §7.3 y §11).
- **Worker / Mini App:** El ABI de ambas contratos cambia; el Worker deberá trigger `confirm_result` con el nuevo flujo; la Mini App deberá añadir `approve` de USDC antes de `deposit`.
- **SDD:** No cambian las reglas de negocio (la mecánica por participaciones ya está definida en §7); el código deja de usar el mock y pasa a implementar exactamente lo que el SDD ya especifica.