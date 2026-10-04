# Copy de la landing — narrativa outside-in

Fuente de verdad de los textos: `packages/nextjs/locales/es.json` y `en.json`. Este documento explica **por qué** cada texto dice lo que dice. Si se cambia un texto, actualizar los dos JSON y esta tabla.

## Historia en una línea por paso

| Paso | Respuesta |
| --- | --- |
| ¿Qué está roto? | El pozo entre amigos es una promesa: se anota en el chat y siempre alguien "paga después". |
| ¿Quién lo vive? | Quien organiza el pozo del grupo (el partido, el reto del gimnasio, la apuesta entre amigos). |
| Workaround de hoy | Anotar en el chat, cobrar por transferencia y perseguir a los que no pagaron. |
| Costo | Plata que nunca se cobra, tiempo persiguiendo gente y tensión entre amigos. Ejemplo ilustrativo: pozo de $50, se cobran $30. |
| Wedge (lo que resolvemos HOY) | El pozo se deposita al unirse y el contrato le paga al ganador cuando la mayoría lo confirma. |
| Visión | Comunidades, equipos y hackathons; aceptar USDG de Paxos además de USDC. |

## Tabla de reescritura

| Sección | Copy actual | Copy nuevo ES | Copy nuevo EN | Motivo |
| --- | --- | --- | --- | --- |
| Hero · eyebrow | Retos entre amigos · Pozo en Arbitrum | Retos entre amigos · Pozo asegurado en Arbitrum | Challenges with friends · Pot secured on Arbitrum | Promesa (pozo asegurado) antes que la tecnología. |
| Hero · H1 | El pozo existe antes de que haya un ganador. | Retá a tus amigos. El pozo ya está cobrado. | Challenge your friends. The pot's already collected. | Acción + resultado en dos frases cortas; se entiende en 10 s y es fácil de repetir. |
| Hero · subtítulo | Armá un reto con tu grupo y cada uno pone su parte… | El pozo existe antes de que haya un ganador. Cada uno deposita al unirse, en un contrato en Arbitrum escrito con Stylus, y la plata solo puede ir al ganador o volver a quien la puso. | The pot exists before there's a winner. Everyone deposits when they join, into an Arbitrum contract built with Stylus… | El lema pasa a brand line secundaria. Mención 1 de Arbitrum + Stylus. Promesa verificable en el contrato. |
| Hero · CTA principal | Crear mi primer reto | Crear mi reto | Create my challenge | Verbo de acción + resultado concreto (el pozo). |
| Nav · "Producto" | Producto | El problema | The problem | La sección ahora cuenta el problema, no el producto. |
| Nav · CTA | Comenzar (iba a /login) | Probar bot (abre el bot de Telegram) | Try the bot | El CTA lleva directo al producto real. |
| Problema · título | Las metas se cumplen cuando hay algo en juego | Ganás un pozo de $50 y cobrás $30 | You win a $50 pot and collect $30 | Escenario cuantificable (ilustrativo, no es una métrica). Genera la pregunta "¿por qué?". |
| Problema · subtítulo | OtterPot convierte una promesa entre amigos… | Pasa en cualquier pozo entre amigos: dos de cinco "te pagan después"… OtterPot lo cobra por adelantado. | It happens in every pot between friends… OtterPot collects it upfront. | Quién lo vive, workaround actual y costo emocional. |
| Pilar 1 | Armá el reto | Armá el reto en el grupo | Set it up in the group | Refuerza que pasa donde ya está el grupo. |
| Pilar 2 | Poné tu parte | Todos ponen antes de empezar | Everyone pays in first | Es el wedge: nadie juega sin depositar. |
| Pilar 3 | Cobrá el premio | El ganador cobra solo | The winner gets paid automatically | Resultado, no mecanismo. |
| Cómo funciona · paso 4 | Cumplí la meta | El grupo confirma: la mayoría vota quién cumplió | The group confirms | Refleja el modo real (auto-consenso). |
| Cómo funciona · paso 5 | Cobrá | El ganador cobra… si vence el plazo sin acuerdo, cada uno recupera lo suyo | The winner gets paid… everyone gets their money back | Agrega la garantía de reembolso (SDD §6.3). |
| Cómo funciona · botón | Faucets | Conseguir fondos de prueba | Get test funds | Elimina jerga ("faucet"). |
| Demo · subtítulo | El video y el documento… | Un pozo real, de la creación al pago, en video y en documento. | A real pot, from setup to payout… | Más corto, orientado a lo que se ve. |
| Demo · tarjeta faucets | Faucets y puente · Circle · Bridge · ETH de prueba | Fondos de prueba · USDC y ETH de prueba para probar el flujo | Test funds · Test USDC and ETH… | Elimina jerga ("faucet", "bridge"). |
| Comunidad · título | Los retos se juegan en el grupo | El reto se arma donde ya está tu grupo | Challenges start where your group already is | Distribución: cero instalación. |
| Por qué · título | Por qué OtterPot | Por qué en Arbitrum | Why Arbitrum | Responde "¿por qué Arbitrum?" (criterio de claridad). |
| Por qué · ítem 1 | Custodia en contrato | Contrato en Rust con Stylus: reentrada bloqueada por defecto, menos gas que en Solidity | Rust contract, built with Stylus… | Mención 2 de Stylus, con el POR QUÉ (seguridad + costo). |
| Por qué · ítem 2 | Verificable | Nadie guarda la plata | Nobody holds the money | Por qué blockchain: sin custodio no hay que confiar en nadie. |
| Por qué · ítem 3 | Listo en minutos | Barato y rápido (Arbitrum vs Ethereum) | Cheap and fast | Por qué Arbitrum y no L1. |
| Por qué · ítem 4 | Hecho para grupos | Reglas que no cambian | Rules that don't change | Beneficio del contrato inmutable, en lenguaje llano. |
| Casos · título | Para cualquier meta | Hoy, entre amigos. Mañana, para cualquier comunidad | Today, between friends. Tomorrow, for any community | Separa el wedge de la visión. |
| FAQ · fondos | ¿Dónde queda mi plata? | ¿Quién tiene la plata mientras dura el reto? Nadie: queda en el contrato… | Who holds the money during the challenge? | Pregunta real del usuario; respuesta fiel al contrato (el ganador debe ser participante). |
| FAQ · sin contrato | ¿Funciona sin contrato desplegado? | ¿Qué pasa si el grupo no se pone de acuerdo? | What if the group can't agree? | Elimina jerga ("ChallengePool", "on-chain") y responde una objeción real. |
| FAQ · costo | Crear la cuenta es gratis… | …cuando un reto se resuelve, se descuenta una comisión; los reembolsos no pagan comisión | …a fee is taken from the pot; refunds are fee-free | No prometer "gratis": el contrato cobra comisión al resolver (SDD §8). |
| CTA final | Tu próximo reto empieza hoy | Tu próximo reto, con el pozo cobrado desde el día uno | Your next challenge, with the pot collected from day one | Repite el beneficio central, fácil de repetir. |
| Footer · tagline | Retos entre amigos con pozo compartido. Funciona con o sin contrato on-chain. | El pozo existe antes de que haya un ganador. Retos entre amigos con la plata asegurada desde el primer día. | The pot exists before there's a winner… | Brand line + elimina jerga ("on-chain"). |
| Footer · disclaimer | Arbitrum — OtterPot | Prototipo en testnet (Arbitrum Sepolia), USDC de prueba, riesgo de Aave y USDG como próximo paso. | Testnet prototype (Arbitrum Sepolia)… Next step: support for Paxos USDG. | Disclaimer pedido + mención de USDG como roadmap, sin prometerlo como existente. |
| Tira en vivo | Sync · OK/Off · on-chain/off-chain | Estado · En línea/Sin conexión · en el contrato/aún no está en el contrato | Status · Online/Offline · in the contract/not in the contract yet | Elimina jerga ("Sync", "on-chain", "off-chain"). |

## Términos técnicos eliminados

`on-chain` / `off-chain` (footer, FAQ, tira en vivo), `ChallengePool`, `Faucets` y `Bridge` (en textos de tarjetas y botones), `Sync`, `Mobile first`.

## Pendientes de validar por el equipo

- **USDG de Paxos**: hoy el contrato y el SDD solo usan USDC (SDD §6.5). El copy lo presenta como "próximo paso". Si no está en el plan, quitarlo de `footer.disclaimer`.
- **"Menos gas que en Solidity"**: afirmación general sobre Stylus (cómputo WASM); no hay benchmark propio del contrato.
- **Testimonios** (Camila R., Diego M., Ana P.): si no son citas reales, reemplazarlos o marcarlos como ilustrativos antes de presentar.

## Secciones agregadas (prompt B)

- **Feedback que ya incorporamos** (`#feedback`): reemplaza los testimonios genéricos. Reseñas reales del jurado (Antonella, Gianella Coronel, Alejandra Catacora) con la respuesta del equipo. Las respuestas solo citan lo que existe en el contrato o está en el roadmap del SDD (§2.2, §6.3, §6.4, §8.2). **Revisar antes de publicar**: las respuestas a Antonella y Gianella las redactó el asistente; la afirmación "estamos midiendo el gas de Stylus frente a Solidity" es del equipo.
- **Quiénes lo estamos construyendo** (`#equipo`): 4 tarjetas con roles oficiales.
- **ETH Lima** eliminado (lista "Construido sobre" y header de la app).
