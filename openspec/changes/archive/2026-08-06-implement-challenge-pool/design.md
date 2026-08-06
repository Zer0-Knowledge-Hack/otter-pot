## Context

El sistema utilizará Arbitrum (Stylus/Rust) para el smart contract `ChallengePool`. Ver `proposal.md` para motivación sobre la necesidad de custodiar de forma transparente los fondos.
Actualmente se cuenta con la infraestructura inicial (scaffold-stylus) y la definición de negocio y arquitectura en el SDD. Este será el contrato fundacional del sistema, que interactuará con el contrato `TreasuryVault` (para gestión del rendimiento), Cloudflare Workers (para orquestación de la confirmación) y las wallets (para los depósitos).

## Goals / Non-Goals

**Goals:**

- Implementar de forma segura en Rust/Stylus la máquina de estados del reto (Abierto -> Bloqueado -> Resuelto / Reembolsado).
- Gestionar una estructura de almacenamiento robusta para múltiples retos concurrentes.
- Proveer interfaces para el depósito directo (de usuario) y resolución/confirmación (por parte de los participantes o cuenta operadora).
- Implementar el cálculo de comisiones dinámicas priorizando descuento sobre el rendimiento generado.

**Non-Goals:**

- Implementación completa del `TreasuryVault` en este cambio (el `ChallengePool` definirá o usará una interfaz mínima para interactuar con la tesorería).
- Soporte multimoneda o tokens ERC20 (asumiremos depósitos en moneda nativa para simplificar MVP según especificación).

## Decisions

- **Estructura de Datos**: El estado del contrato alojará un mapping de `challenge_id` a una estructura `Challenge` (creador, depósito requerido, plazo, estado actual, shares_tesoreria, etc.).
  *Rationale*: Simplifica consultas y actualizaciones O(1) de cada reto.
- **Interacción con TreasuryVault**: Se usará una interfaz externa, donde `ChallengePool` envía fondos y recibe `shares` al bloquear el reto, y al resolver canjea sus `shares` y recibe de vuelta `capital + yield`.
  *Rationale*: Permite un fuerte desacoplamiento y el cumplimiento del modelo de contabilidad por participaciones descrito en el SDD.
- **Gestión de Comisiones**: La comisión se aplicará sobre el valor total recuperado, restándose primero de la porción de "rendimiento", y solo de la porción de "capital" si el rendimiento no alcanza para cubrir la tarifa base.
  *Rationale*: Es una regla explícita de negocio para mantener la viabilidad de la plataforma.

## Risks / Trade-offs

- **[Risk]** Ataques de Reentrancy en retiros/reembolsos. → *Mitigation:* Se seguirá rigurosamente el patrón "Checks-Effects-Interactions", mutando el estado (ej: a Resuelto o Reembolsado) ANTES de realizar las transferencias externas.
- **[Risk]** Pérdida de fondos por manipulación del operador. → *Mitigation:* El contrato no expondrá funciones que acepten direcciones arbitrarias de destino de fondos; la función de resolución siempre transferirá al ganador determinado por consenso.
