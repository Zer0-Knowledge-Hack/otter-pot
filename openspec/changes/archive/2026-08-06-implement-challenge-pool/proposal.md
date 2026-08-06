## Why

Implementar el smart contract `ChallengePool` es fundamental para el MVP del proyecto (OtterPot). Según el SDD, este contrato es el custodio de cada reto, gestiona el pozo, los estados (Abierto, Bloqueado, Resuelto, Reembolsado), las confirmaciones y las transferencias de recompensas y reembolsos. Es el componente central para la plataforma en Arbitrum de retos con pozo compartido.

## What Changes

- Creación del contrato `ChallengePool` en Rust usando `stylus_sdk`.
- Implementación de la estructura de datos del reto (participantes, depósito requerido, plazo, estado, etc.).
- Implementación del ciclo de vida del reto: creación (`create_challenge`), depósitos (`deposit`), confirmación de resultados (`confirm_result`) y resolución/reembolso.
- Interacciones seguras (protección contra reentradas y control estricto sobre transferencias externas, sólo al ganador calculado).
- Emisión de eventos on-chain para asegurar la transparencia.

## Capabilities

### New Capabilities

- `challenge-pool`: Define los estados, transiciones, depósitos, resoluciones, reembolsos y aplicación de comisiones del contrato.

### Modified Capabilities

## Impact

- **Contratos (Stylus):** Agrega el contrato principal del sistema en la capa de blockchain.
- **Backend / Worker:** El Worker necesitará el ABI de este contrato para hacer los relayings correspondientes en `confirm_result`.
- **Seguridad:** Introduce custodia de fondos, por lo cual se aplican estrictas restricciones para que el operador no pueda mover fondos libremente a ninguna dirección que no sea el ganador calculado, y mitigaciones contra reentradas.
