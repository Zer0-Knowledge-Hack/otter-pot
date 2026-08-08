# GEMINI.md

Este archivo complementa a `AGENTS.md` (misma raíz del repo), que contiene las convenciones completas de build, test, estilo de código y límites de seguridad. Léelo primero si vas a modificar código. Este archivo resume lo esencial para no perder contexto entre sesiones.

## Qué es este proyecto

**OtterPot**: retos entre amigos con pozo de premios compartido, sobre Arbitrum (Stylus/Rust), con interfaz 100% en Telegram (bot + Mini App). Proyecto para el track de Arbitrum de ETH Lima 2026.

La identidad visual (nombre, mascota, paleta) es `DESIGN.md`. No inventes nombres, colores ni tono de marca fuera de ese documento.

La fuente de verdad de negocio y arquitectura es `docs/SDD.md`. Antes de proponer un cambio de diseño (nuevo estado de reto, nueva regla de comisión, cambio en el modelo de tesorería), consulta ese documento — si tu cambio lo contradice, señálalo explícitamente en vez de improvisar una solución distinta.

## Piezas clave del sistema

- `ChallengePool` (contrato): custodia cada reto individual, gestiona depósitos, confirmaciones, resolución y reembolsos.
- `TreasuryVault` (contrato): agrupa capital de retos activos, lo coloca en un protocolo externo de rendimiento vía un adaptador intercambiable, y usa contabilidad por participaciones (no división "por día") para que ningún reto gane o pierda ventaja por el tamaño de la tesorería en un momento dado. Detalle completo en SDD sección 7.2.
- Worker orquestador (bot): interactúa con Telegram y el contrato; mantiene una cuenta operadora que solo puede relayar confirmaciones ya verificadas off-chain, nunca mover fondos a direcciones arbitrarias.
- Worker de tesorería (sweeper): tarea programada (cron) en un Worker independiente que mueve el capital inactivo hacia Aave utilizando la llave del administrador, aislada del bot público.

## Reglas que no debes romper

- Nunca generes código que permita a la cuenta operadora del backend transferir fondos a una dirección distinta del ganador calculado por el contrato.
- Nunca sugieras hardcodear claves privadas o secretos; usa el mecanismo de secretos de Cloudflare Workers o variables de entorno de CI.
- Cualquier cambio a las funciones públicas de los contratos requiere correr `cargo stylus check` y `cargo stylus export-abi` después, y actualizar el ABI que consume el Worker.

## Comandos que vas a usar seguido

- `cargo stylus check` / `cargo stylus deploy` / `cargo stylus export-abi` — ver `AGENTS.md` para flags y contexto completo.
- `wrangler dev` / `wrangler deploy` — Worker de Cloudflare.

Para todo lo demás (estructura de carpetas, convención de commits, checklist previo a cerrar una tarea), remite a `AGENTS.md`.
