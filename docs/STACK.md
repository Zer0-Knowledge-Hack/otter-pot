# Mapa de reutilización y stack — OtterPot

| Campo | Valor |
|---|---|
| Estado | v1 — mapeo para reconstrucción sobre cimientos |
| Fecha | 2026-08-07 |
| Rama | `rework/product-foundations` |
| Supuesto de horizonte | Construir bien, más allá del MVP de la hackathon. Si el objetivo sigue siendo demostrar mañana, este documento **no** es el plan correcto — ver §7 |
| Documentos hermanos | `docs/PRODUCT.md` (qué y para quién), `docs/VALIDATION.md` (si aguanta), `docs/SDD.md` (cómo se construye) |

---

## 1. Qué se reutiliza y qué no

Criterio: se conserva lo que resuelve un problema real del dominio; se descarta lo que resuelve un problema que ya no tenemos.

### ✅ Se reutiliza tal cual

| Pieza | Por qué |
|---|---|
| `challenge_pool` (Rust/Stylus) | Ciclo de vida completo implementado. Es el corazón del producto. Tiene bugs de control de acceso, pero son parches, no reescritura |
| `treasury_vault` | Idem. El modelo de shares es correcto de diseño; falta la contabilidad por tenedor y las guardas |
| `mock_usdc` | Permite probar todo el flujo sin depender de USDC real. Vale oro para el devnode |
| `scripts/otter.ts` | Resuelve red y firmantes entre devnode local y Sepolia. Infraestructura invisible que no hay que rehacer |
| `scripts/integration-test-usdc.ts` | Ejercita el ciclo completo end-to-end contra una cadena. Es la mejor prueba que tiene el proyecto y la mejor demo de respaldo |
| `scripts/{deploy,setup-contracts,create-participants,fund-participants,status,txhistory}.ts` | Días de tooling ya hechos |
| `nitro-devnode/` | Cadena local funcionando |
| `worker/src/confirmTx.ts` | Capa pura con la guarda de seguridad. Bien diseñado, se conserva |
| `worker/src/confirmations.ts` | Lógica de consenso con tests. Se conserva; hay que cambiarle el store |
| `DESIGN.md` | Identidad visual completa y ya oficial |

### 🔧 Se adapta

| Pieza | Qué cambia |
|---|---|
| `worker/src/telegram.ts` | Hoy solo valida el secret del webhook. Falta todo el bot conversacional |
| `worker/src/index.ts` | Store en memoria → KV real. Y conectar el webhook con el conteo de confirmaciones |
| `InMemoryConfirmationStore` | Se mantiene como doble para tests; en producción va KV |
| `packages/nextjs` (el proyecto) | Se conserva como proyecto Next.js. Se le arranca el contenido |

### ❌ Se descarta

| Pieza | Por qué |
|---|---|
| `app/page.tsx`, `app/blockexplorer/`, `app/debug/` | Scaffold de demostración. No es nuestro producto |
| `components/scaffold-eth/`, `hooks/scaffold-eth/` | Acoplados al flujo de dApp de escritorio |
| **RainbowKit** | Diseñado para conectar wallets de navegador con extensión. Dentro de Telegram no hay extensiones. Es la dependencia equivocada para nuestro canal |
| `burner-connector`, `kubo-rpc-client`, `qrcode.react` | Del scaffold, sin uso en nuestro producto |
| `QUICKSTART.md` | Es una guía de OpenSpec y open-agent-hub, no de desarrollo. Hay que reescribirlo entero (ver §6) |

---

## 2. Stack por capa

### 2.1 Contratos — **decidido, no se toca**

Rust + Stylus SDK 0.8 sobre Arbitrum. Toolchain pinneado a 1.91.0.

Motivo para no moverlo: es lo único terminado, funciona, y el equipo ya invirtió el aprendizaje. Las dudas sobre la cadena (§4) no justifican tirar esto.

### 2.2 Bot y orquestador — **decidido**

Cloudflare Workers + TypeScript + viem 2.39.

Pendiente de decidir: la librería del bot. Telegram sobre Workers no admite librerías que asuman Node completo con long polling; hay que trabajar por webhook. La opción conservadora es hablar contra la Bot API con `fetch` directo, sin framework — es poco código y evita pelear con el runtime.

### 2.3 Estado — **pendiente**

KV de Cloudflare es lo que asume el plan actual. Vale evaluar Durable Objects: el conteo de confirmaciones es exactamente el caso de uso de un objeto con estado consistente y un solo escritor, y evita las condiciones de carrera que KV puede tener con escrituras concurrentes al mismo reto.

**Esta decisión importa más de lo que parece**: el consenso es el punto donde dos confirmaciones simultáneas pueden corromper el conteo.

### 2.4 Mini App — **a construir**

Next.js (se conserva el proyecto), servida como Telegram Mini App.

Dos cosas que hay que hacer bien desde el principio:

1. **Validar `initData` en el backend, siempre.** Telegram firma un objeto `initData` con el token del bot (HMAC-SHA256). Es la única forma de saber que la petición viene de Telegram y no de alguien falsificando un user ID. Nunca confiar en el `initData` sin verificar.
2. **Wallet**: dentro de Telegram no hay extensiones de navegador. Las vías reales para EVM son WalletConnect o una wallet embebida (Privy, que es lo que asume el SDD). Privy sigue siendo la opción coherente con el diseño, pero es un bloqueante activo del backend hoy.

### 2.5 Landing — **a construir**

Mismo proyecto Next.js, desplegado en Vercel. Contenido en §5.

---

## 3. La frontera canal/dominio, ahora con una razón concreta

Vengo insistiendo con separar el canal del dominio. Hasta ahora el argumento era higiene. Con la idea de Base/Farcaster pasa a ser económico:

```
┌─────────────┐  ┌─────────────┐  ┌──────────────┐
│  Telegram   │  │ Farcaster   │  │   Web        │  ← canales
└──────┬──────┘  └──────┬──────┘  └──────┬───────┘
       └────────────────┼────────────────┘
                 ┌──────▼───────┐
                 │  Adaptador   │  identidad + wallet por canal
                 └──────┬───────┘
                 ┌──────▼───────┐
                 │   Dominio    │  retos, consenso, pozo
                 └──────┬───────┘
                 ┌──────▼───────┐
                 │  Contratos   │
                 └──────────────┘
```

Lo único que cambia entre canales es **cómo se identifica al usuario y cómo firma**. En Telegram es `initData` + Privy/WalletConnect. En Farcaster es el contexto del Mini App SDK. El dominio no debería enterarse.

Si esa frontera existe, el puerto a Farcaster es un adaptador. Si no existe, es reescribir el backend.

---

## 4. 🔴 El puerto a Base/Farcaster tiene un problema serio

La idea es buena para adopción y el camino técnico del frontend es real: los Mini Apps de Base y Farcaster son aplicaciones Next.js, se construyen con MiniKit (parte de OnchainKit), y hay plantillas de un solo código base para Base App y Farcaster. Necesitan una URL pública desplegada.

**Pero los contratos no portan.**

Stylus es específico de Arbitrum: son contratos WASM corriendo sobre Nitro. Base es OP Stack, EVM puro. **Un contrato Stylus no se despliega en Base.** Portar significaría reescribir `ChallengePool` y `TreasuryVault` en Solidity.

Tres caminos, ninguno gratis:

| Camino | Costo | Consecuencia |
|---|---|---|
| Mini App de Farcaster contra Arbitrum | Bajo | El usuario de Base/Farcaster necesita fondos en Arbitrum. Fricción alta, justo lo que el producto promete evitar |
| Reescribir los contratos en Solidity para Base | Alto | Dos bases de contratos que mantener, dos auditorías, dos superficies de bug |
| Solidity desde el principio, multi-cadena | Muy alto ahora | Tira el único activo terminado del proyecto |

**Recomendación: no decidir esto todavía.** Construir la frontera del §3 —que es barata y sirve igual— y dejar el puerto para cuando haya evidencia de que alguien usa el producto. Es la misma disciplina que aplicamos a la idea: no construir para un usuario que todavía no existe.

Y notar que esta es **la tercera vez** que la elección de Arbitrum aprieta la distribución: primero TON (`VALIDATION.md` §2.1), ahora Base. No es casualidad — es el costo real de haber elegido la cadena por el sponsor del track.

---

## 5. Landing page — qué tiene que contener

Según lo pedido, cinco bloques:

| Bloque | Contenido | Riesgo |
|---|---|---|
| Qué es | "Un pozo verificable que se ejecuta solo" (`VALIDATION.md` §10) | No decir "fricción cross-border" ni "rendimiento": ambos son falsos hoy |
| Video demo | El ciclo completo: crear reto → depositar → resolver → cobrar | Si el bot no está, `integration:usdc` con hashes reales sirve |
| La historia | De los sobrecitos de UglyCash al pozo verificable (`PRODUCT.md` §1) | Es una buena historia y es verdadera. Contarla tal cual |
| Casos de uso | Reto, vaquita, junta, colecta — mismo contrato, distinta regla y destino | No prometer los que no están implementados sin marcarlos |
| Quiénes | William, Julio, Moises, Luishiño (SDD §4) | — |

La identidad visual completa ya está en `DESIGN.md`. **El eslogan sigue marcado como pendiente y no debe ir a la landing** hasta resolverlo.

---

## 6. Deuda que arrastra el repo y hay que limpiar

1. **`QUICKSTART.md` está roto**: recomienda `bun`/`pnpm` sobre un repo lockeado en yarn 3.2.3; no lista Docker, `cast` ni `jq` que el devnode exige; enlaza `docs/DESIGN.md` que está en la raíz; y no explica cómo correr nada.
2. **El CI nunca corre**: dispara en `main`, la rama es `master`. Y no incluye al worker ni los tests de Rust.
3. **Los tests del worker no están en ningún pipeline** ni en el script `test` de la raíz.
4. **Tres clientes de cadena**: `packages/stylus` usa ethers 6 + viem 1.19.9; worker y nextjs usan viem 2.39. Unificar en viem 2.
5. **`integration-test-usdc.ts:52`** declara `confirmResult(...) returns (bool)`; el Rust retorna `()`.

---

## 7. Orden de construcción

**Bloque 0 — antes de escribir una línea nueva** (no negociable):

1. `redeem_shares` sin control de caller — cualquiera vacía el vault entero (`treasury_vault/src/lib.rs:180`).
2. `confirm_result` sin validar que `winner` pertenezca al reto (`challenge_pool/src/lib.rs:319`).
3. Tests de contrato para ambos, en `lib.rs`, no solo en `logic.rs`.
4. CI que corra: cambiar `main` → `master`, y agregar tests de Rust y del worker.

Sin esto, todo lo que construyamos encima se apoya en un contrato que cualquiera puede vaciar. Son los cimientos, literalmente.

**Bloque 1 — hacer que el flujo exista de punta a punta:**

5. Frontera canal/dominio en el worker (§3).
6. Store real de confirmaciones (KV o Durable Objects, §2.3).
7. Conectar webhook → conteo → `confirmResult`.
8. Deploy en Sepolia y registrar la wallet operadora.

**Bloque 2 — lo visible:**

9. Bot conversacional.
10. Mini App con validación de `initData` y wallet.
11. Landing + video.

**Bloque 3 — solo con evidencia de uso:**

12. Puerto a Base/Farcaster (§4).
13. Yield real.

---

## 8. Decisiones abiertas

1. **Horizonte**: ¿esto es post-hackathon o todavía hay que demostrar algo mañana? Cambia todo el orden del §7.
2. **KV vs Durable Objects** para el consenso (§2.3).
3. **Umbral de consenso exacto**: el SDD dice "mayoría" sin número. No depende de código, depende del equipo.
4. **Privy vs WalletConnect** para la wallet dentro de Telegram.
5. **Wallet operadora**: ¿la misma que el owner del contrato o separada? Hoy los scripts asumen que es la misma.
