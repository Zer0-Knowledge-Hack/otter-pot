# AGENTS.md

## Resumen del proyecto

**OtterPot** es una plataforma de retos entre amigos con pozo de premios compartido, construida sobre Arbitrum (Stylus/Rust) para ETH Lima 2026. La interfaz de usuario vive enteramente en Telegram (bot + Mini App). Los fondos se custodian en un smart contract (`ChallengePool`) que delega la gestión de capital agregado a un contrato de tesorería (`TreasuryVault`) conectado a un protocolo externo de rendimiento mediante un adaptador intercambiable.

La especificación completa de negocio y arquitectura vive en `docs/SDD.md`. Ese documento es la fuente de verdad para cualquier decisión de diseño; si el código y el SDD entran en conflicto, se actualiza el SDD primero y luego el código, nunca al revés.

## Estructura del repositorio

Un solo monorepo, clonado a partir del template de Scaffold-Stylus (yarn workspaces), con un paquete adicional para el Worker de Cloudflare:

```
/packages
  /stylus            # Contratos Rust/Stylus (incluido en el template)
    /contracts
      /challenge_pool  # Contrato ChallengePool
      /treasury_vault  # Contrato TreasuryVault + adaptador de yield strategy
  /nextjs            # Landing page + Telegram Mini App (incluido en el template)
                       # Next.js + RainbowKit + Wagmi + TailwindCSS
  /worker            # Bot de Telegram + orquestador — Cloudflare Workers (TypeScript)
  /sweeper           # Tarea programada (Cron) para mover fondos a estrategia de rendimiento
/docs
  SDD.md             # Especificación de diseño — fuente de verdad de negocio/arquitectura
  diagrams/          # Diagramas exportados si se necesitan fuera de SDD.md
```

Un solo repositorio simplifica el entregable de la hackathon (un único link) y aprovecha el hot-reload de ABI entre `packages/stylus` y `packages/nextjs` que ya trae Scaffold-Stylus. El paquete `packages/nextjs` cumple doble función: landing informativa del proyecto y la URL que abre la Telegram Mini App (una Mini App es una webview apuntando a una URL, no requiere un frontend aparte). El paquete `packages/worker` se despliega desde su propio subdirectorio en Cloudflare, sin necesidad de un repo separado.

Actualizar este árbol en cuanto la estructura real del repo se aleje de esta propuesta.

## Comandos de build y test

**Contratos (Stylus/Rust):**

- `cargo stylus check` — valida que el contrato compile a WASM y sea deployable, sin gastar gas. Ejecutar después de cada cambio relevante.
- `cargo stylus export-abi` — genera el ABI que consume el Worker. Ejecutar cada vez que cambien las funciones públicas del contrato.
- `cargo stylus deploy --private-key <clave_testnet>` — despliegue en Arbitrum Sepolia. Nunca usar una clave con fondos reales fuera de testnet sin aprobación explícita del equipo.
- `cargo test` — pruebas unitarias del contrato.

**Worker (Cloudflare):**

- `wrangler dev` — entorno local de desarrollo del bot/orquestador y del sweeper.
- `wrangler deploy` — despliegue a Cloudflare.
- `npm test` — pruebas del backend y scripts automatizados.

## Convenciones de código

- **Rust:** formatear con `cargo fmt` y validar con `cargo clippy` antes de cualquier commit que toque `/contracts`. No usar `unwrap()` en rutas que manejan fondos de usuario; propagar errores explícitamente.
- **TypeScript (Worker/Mini App):** `prettier` + `eslint` con la configuración del repo. Preferir tipado estricto; no usar `any` en el módulo que construye transacciones hacia el contrato.
- **Nombres de funciones del contrato:** deben coincidir exactamente con los definidos en `docs/SDD.md` (secciones 6 y 7). Si se necesita renombrar una función, actualizar el SDD en el mismo cambio.

## Límites de seguridad — nunca hacer esto sin aprobación explícita

- No commitear claves privadas, secretos de Privy, ni variables de entorno reales. Usar `wrangler secret` para el Worker y variables de entorno inyectadas en CI para el contrato.
- No dar a la cuenta operadora del Worker (ver SDD sección 11) ninguna función que pueda mover fondos a una dirección distinta del ganador calculado por el contrato.
- No cambiar la estrategia de rendimiento de `TreasuryVault` (dirección del adaptador) sin que quede registrado como decisión aprobada por la cuenta administradora — ver SDD sección 7.3.
- No modificar direcciones de contratos ya desplegados en los archivos de configuración sin coordinarlo con el resto del equipo; esos archivos son la referencia que usan el Worker y la Mini App.

## Convención de commits

Conventional commits: `feat:`, `fix:`, `chore:`, `docs:`, `test:`. Ejemplo: `feat(contracts): agregar refund() con reembolso proporcional de yield`.

## Antes de dar por terminada una tarea

1. Si el cambio toca `/contracts`: `cargo fmt`, `cargo clippy`, `cargo stylus check`, `cargo test`.
2. Si el cambio toca `/worker`: `npm run lint`, `npm test`.
3. Si el cambio afecta el modelo de datos, el ciclo de vida de un reto, el modelo de comisiones o el modelo de tesorería: reflejarlo en `docs/SDD.md` antes de cerrar la tarea.
