# Fundamentos de producto — OtterPot

| Campo | Valor |
|---|---|
| Estado | v2 — incorpora génesis del producto, análisis competitivo verificado y tesis del agente |
| Fecha | 2026-08-07 |
| Base | SDD v3, reunión del 4 ago 2026, contratos implementados, búsqueda competitiva |
| Relación con el SDD | El SDD define **cómo** se construye. Este documento define **por qué** y **para quién**. Si entran en conflicto, se discute aquí primero. |

Este documento existe para responder una sola pregunta: **¿alguien necesita esto?**

El modo más común de fracaso en una hackathon no es técnico: es construir con solvencia algo que nadie pidió, que ya existe, o que no necesitaba blockchain.

---

## 1. De dónde salió la idea

Importa porque explica qué está validado y qué es suposición.

El origen son los **sobrecitos de UglyCash**: un neobanco de stablecoins donde varias personas ponen dinero en un sobre compartido y hacen retos progresivos — caminar X kilómetros, levantarse a cierta hora, sostenerlo durante X días. La resolución es **manual y por buena fe**: los participantes declaran en la app quién ganó y el monto se ejecuta.

Esto es evidencia de demanda, y es lo más valioso que tiene el proyecto: **el comportamiento ya existe y la gente ya lo hace.** No hay que inventar el hábito.

De ahí salieron tres decisiones encadenadas:

1. Si el hábito existe pero vive encerrado en una app, llevarlo a donde el grupo ya está → **Telegram, sin instalar nada**.
2. Si el bot vive en el grupo, que sea configurable y reutilizable por cualquiera → **el modelo Rose**.
3. Si la resolución es buena fe, darle capacidad de juicio → **el agente**.

---

## 2. La tesis real

De todos los pivotes (retos, hackathones, colectas) sobrevive un solo primitivo, y el equipo lo nombró así:

> **Un agente toma una decisión que mueve dinero, y las personas la aprueban o la vetan.**

Esa frase es el producto. Todo lo demás es un caso de uso.

| Caso de uso | Qué juzga el agente | Quién ratifica | Destino |
|---|---|---|---|
| Reto entre amigos | Pruebas del proceso (tiempo, pasos, evidencia) | Los participantes | Un participante |
| Reto de comunidad | Lo mismo, con reglas más estrictas | Todos los miembros | Un participante |
| Hackathon | Commits, deploys, transacciones on-chain, tests | Jurados, o jurados + participantes | Ganador |
| Colecta | Meta alcanzada | La comunidad | Wallet externa |

Un solo contrato, un solo agente, un solo mecanismo de ratificación. Cambia qué se juzga y adónde sale el dinero.

### 2.1 Por qué cada pieza es necesaria

Esta es la prueba que hay que pasar, pieza por pieza:

- **¿Por qué un agente?** Porque el juicio no escala. Dev3Pack: más de 800 proyectos calificados en menos de 12 horas. Es físicamente imposible hacerlo bien, y el resultado fue desconfianza pública. El agente no reemplaza el juicio humano — lo hace abarcable.
- **¿Por qué blockchain?** Porque el juicio tiene que ser **vinculante y vetable a la vez**. Si el agente decide y un servidor ejecuta, estás pidiendo confianza ciega. En contrato, la decisión queda registrada, el veto es ejecutable y nadie —ni nosotros— puede mover el dinero a otro lado.
- **¿Por qué Telegram?** Porque el grupo ya está ahí. Cero instalación, cero registro, y el ecosistema cripto vive en Telegram. La distribución es el producto.
- **¿Por qué no-custodio?** Porque retener fondos de terceros te convierte en transmisor de dinero: licencia, KYC/AML, país por país. Es la muerte regulatoria de un equipo de cuatro personas.

**Ninguna de esas cuatro es decorativa.** Sacá cualquiera y el proyecto se cae o se vuelve ilegal.

### 2.2 Lo que NO justifica nada

Hay que dejar de usar estos argumentos, porque el primer jurado técnico los rompe:

- *"Todo es transparente en la cadena"* — cierto pero irrelevante para un pozo de $40 entre amigos. **Excepción real:** en el caso hackathon la transparencia SÍ es el producto, porque el problema declarado es la desconfianza en los resultados.
- *"Gamificación e insignias"* — se hace en Postgres.
- *"Genera rendimiento"* — a nuestra escala es falso. Ver §5.3.

---

## 3. Competencia — lo que sí existe

Verificado, no supuesto. Esta sección es la que decide si el proyecto tiene lugar.

| Producto | Qué hace | Qué NO hace |
|---|---|---|
| [UglyCash](https://global.techradar.com/es-mx/pro/finanzas-sin-fronteras-uglycash-aterriza-en-mexico-con-su-app-basada-en-stablecoins) | Neobanco de stablecoins, sobrecitos compartidos, cross-border, ~8% anual | Resolución manual por buena fe. Custodio. Encerrado en su app. Sin juicio automatizado |
| [Vaquita](https://www.vaquita.fi/) (Stellar SCF #42, también Scroll) | Ahorro **individual** gamificado, save-to-earn, penaliza retiro temprano | No es pozo de grupo con regla de salida. No juzga nada |
| [PoolTogether](https://pooltogether.com/) | Lotería sin pérdida sobre ahorro colectivo | Sin reglas de grupo, sin juicio, sin retos |
| [DoraHacks — Hackathon AI](https://dorahacks.io/blog/guides/hackathon-ai) | **Juicio asistido por IA, ya enviado.** El organizador define criterios ponderados; la IA evalúa todo, devuelve lista rankeada con score y razonamiento; los scores de IA se muestran junto a los humanos y el jurado decide | No custodia el pozo ni ejecuta el pago. El veredicto no es públicamente verificable ni vetable por los participantes. Es un portal al que hay que ir |
| [Devpost](https://info.devpost.com/product/ai-hackathons) | Judging integrado, analítica, criterios de aplicación real de IA | Lo mismo: no custodia ni paga |

### 3.1 Qué significa esto

**Malo:** UglyCash ya hace más de lo que creíamos. Stablecoins, cross-border, sobrecitos y rendimiento — todo enviado y pulido. El argumento *"resolvemos la fricción de pagos cross-border"* **ya no nos pertenece**. Hay que sacarlo del pitch.

**También malo:** el espacio de "ahorro grupal cripto gamificado" está poblado. Entrar ahí es pelear de frente contra productos con años de ventaja.

**Peor todavía, y es la corrección más importante de esta versión:** DoraHacks **ya envió** el juicio asistido por IA. Criterios ponderados por el organizador, evaluación de todas las submissions, lista rankeada con score y razonamiento, y scores de IA junto a los humanos para que el jurado decida. AWS calificó más de 200 proyectos en un día con eso.

Es, literalmente, la propuesta que este documento recomendaba como segmento ancla en su versión anterior — enviada por el incumbente, con distribución en el mismo espacio Web3 al que apuntábamos. **El caso hackathon no es un hueco: es competencia frontal.**

**Lo que sí queda:** en toda la lista, **nadie custodia el pozo y ejecuta el pago según el veredicto.** DoraHacks y Devpost juzgan; el dinero se mueve aparte, por confianza y a mano. UglyCash custodia y paga, pero no juzga — resuelve por buena fe. Vaquita y PoolTogether no tienen nada que resolver.

El hueco real es la unión: **juicio + custodia + ejecución + veto, en la misma pieza.**

### 3.2 El wedge, en una frase

> UglyCash te deja apostar con amigos **si todos se bajan la misma app y confían en la palabra del otro.**
> OtterPot funciona **en el grupo que ya tenés, con un árbitro que no es ninguno de ustedes.**

---

## 4. Mercado

En orden de calidad del negocio, no de qué tan divertido suena:

| Segmento | Frecuencia | Quién paga | Veredicto |
|---|---|---|---|
| **Comunidades online sin país común** | Media | Los participantes | **Ancla.** Nadie se conoce, la buena fe no alcanza, y nadie custodia+juzga |
| **Grupos de amigos separados por migración** | Alta | Los participantes | Secundario. UglyCash los cubre parcialmente, pero sin árbitro |
| **Organizadores de hackathones** | Baja por organizador | La institución | **Descartado como ancla.** DoraHacks ya lo hace (§3) |
| **Grupos de amigos co-localizados** | Alta | Los participantes | Descartado. Yape/Plin gratis nos gana |

**Retractación explícita.** La v2 de este documento recomendó hackathones como segmento ancla, corrigiendo a la v1 que los había descartado. Esa recomendación estaba mal, y la evidencia es directa: DoraHacks ya envió Hackathon AI. **La v1 tenía razón al descartarlos, aunque por el motivo equivocado** (frecuencia, cuando el motivo real es que el hueco no existe).

El ancla es **comunidades online sin país común** — influencers Web3, servidores de gaming, DAOs, grupos de Telegram grandes. Es el único segmento donde las cuatro piezas del §2.1 son simultáneamente necesarias:

- Nadie se conoce → la buena fe de UglyCash no alcanza, hace falta un árbitro.
- El árbitro no puede ser un participante ni una empresa → hace falta que sea verificable y no-custodio.
- El grupo ya vive en Telegram → distribución sin instalar nada.
- Hay dinero real en juego → hace falta que el veredicto sea vinculante y vetable.

La fila 4 se abandona: contra Yape gratis, cobrando 2–5%, somos estrictamente peores. Eso no se arregla con mensaje.

**El caso hackathon no se tira: se degrada a demo.** Sigue siendo la historia más vívida para contar en el escenario (800 proyectos, 12 horas, desconfianza pública) y el equipo la vivió. Pero se cuenta como *ejemplo del problema*, no como el mercado que se va a atacar — y si un jurado menciona DoraHacks, la respuesta honesta ya está preparada: ellos juzgan, nosotros además custodiamos y ejecutamos.

---

## 5. Los agujeros abiertos

### 5.1 🔴 El agente NO debe tener billetera propia

Una de las ideas exploradas fue que los participantes envíen los fondos a la billetera del agente antes de empezar.

**Esto hay que descartarlo.** Si el agente custodia, somos custodios, y se cae entero el argumento regulatorio del §2.1: licencia de transmisor de dinero, KYC/AML por país. Además reintroduce exactamente el punto de falla que el producto promete eliminar — el humano (ahora bot) que guarda la plata.

El diseño actual ya es correcto: los fondos viven en `ChallengePool`, y el operador solo puede relayar. **El agente opina; el contrato custodia.** No hay que tocar eso.

### 5.2 🔴 El modo automático sin veto es el mayor riesgo del producto

Se exploró un modo donde, una vez emitido el juicio, nadie puede desistir y el agente ejecuta solo.

Es el modo de máximo riesgo y de mínima diferenciación:

- Un modelo juzgando evidencia ambigua, moviendo dinero de forma irreversible, sin apelación.
- Un solo fallo público destruye la confianza que el producto entero necesita.
- Y elimina justo la mitad interesante de la tesis: **el veto humano ES el producto.** Sin ratificación somos un oráculo que paga solo; con ratificación somos un árbitro asistido. Lo segundo es defendible, lo primero no.

Recomendación: **ratificación siempre**, con ventana de veto y umbral configurable. El "automático" se implementa como *ventana de veto que expira sin objeciones* — se siente automático, pero mantiene la apelación.

### 5.3 🔴 La apuesta no tiene consecuencia

El reembolso devuelve capital más rendimiento, sin comisión, si vence el plazo sin consenso.

Para quien va perdiendo: confirmar → pierde el depósito; no confirmar → lo recupera con intereses. **No confirmar es estrategia dominante.** Uno solo que se calle mata la resolución.

Un reto donde nadie puede perder no es una apuesta: es un plazo fijo con pasos extra.

La ventana de veto del §5.2 lo resuelve casi solo: si el silencio no bloquea sino que **ratifica**, desaparece el incentivo a callarse. Es la misma decisión de diseño resolviendo dos problemas.

### 5.4 🔴 El operador puede pagar a cualquier dirección

`confirm_result(challenge_id, winner)` exige solo `require_operator()`, y la validación comprueba únicamente que el reto esté bloqueado y que `winner` no sea la dirección cero. **Nunca verifica que `winner` sea participante.**

Ver `packages/stylus/contracts/challenge_pool/src/lib.rs:319` y `logic.rs:92`.

Contradice el SDD §11, `AGENTS.md` y la mitigación declarada en el design. Hoy toda la seguridad del sistema es la clave de Cloudflare.

**Matiz importante:** para el caso de colecta, el destino ES externo a los participantes por diseño. Entonces la validación no es "winner ∈ participantes", sino **"winner ∈ destinos declarados al crear el reto"** — fijados antes de que entre el primer depósito y no modificables después.

### 5.5 🟡 El rendimiento no existe a nuestra escala

El SDD §7.4 lo admite. Pero con §8.2 (la comisión sale del rendimiento y, si no alcanza, del capital), en un reto de 3 días por $20 el rendimiento es de céntimos y **la comisión sale casi entera del capital: el ganador recibe menos de lo que el grupo puso.**

*"Retos que crecen juntos"* es literalmente falso a escala MVP. No lo lleves a un jurado que sepa restar.

Donde sí rinde: horizontes de semanas o meses — retos progresivos largos (el formato original de los sobrecitos) y colectas. En el caso colecta, además, el SDD ya define comisión cero, así que el rendimiento va entero al destinatario. Ese es un argumento de pitch fuerte y verdadero.

### 5.6 🟡 El agente es gameable

Julio lo planteó en la reunión: si se sabe qué mide el bot, se optimiza para el bot y no para el reto. El equivalente a SEO.

La ratificación humana lo mitiga pero no lo elimina. Para el caso hackathon —donde hay dinero real y competidores sofisticados— hay que decir explícitamente qué se hace: criterios no publicados en detalle, evidencia de ejecución real (transacciones, no solo despliegue), y última palabra del jurado.

---

## 6. Arquitectura: qué significa "ser infraestructura"

No es publicar un SDK. Es que el dominio no sepa en qué canal vive.

Hoy no se cumple. El SDD §10 dice *"la interfaz completa del producto vive dentro de Telegram"* y §9 define el Worker como *"orquestador entre la interfaz de Telegram y el contrato"*: Telegram está cableado en la capa de servicio, sin frontera.

El equipo ya había decidido lo contrario (reunión, 00:49:56): *"yo lo tomé como un proyecto de infraestructura directamente... una vez que nos casamos con Telegram, que no nos cueste migrar."*

**Recuperar esa decisión cuesta una interfaz y un adaptador hoy; cuesta reescribir el backend en tres semanas.**

El modelo Rose —un bot que cualquiera agrega y configura— es la vía de distribución correcta y hay que preservarla explícitamente: la configuración del reto (qué juzga el agente, umbral de ratificación, destinos válidos) es **parámetro**, no código.

---

## 7. Off-ramp: El Dorado

Construido sobre Arbitrum, con cuota real en LatAm. La alianza tiene sentido y resuelve la pregunta que cierra el ciclo: *"ya gané, ¿cómo lo paso a mi moneda local?"*.

Dos advertencias:

1. **No es dependencia técnica.** El SDD §12 ya lo deja bien: la responsabilidad del contrato termina al transferir al ganador. Mantenerlo así.
2. **No se anuncia una alianza que no existe.** "Tenemos conversaciones con El Dorado" solo se dice si las hay. Un jurado puede preguntar, y si no es verdad se pierde algo más caro que un punto de pitch.

---

## 8. Cómo se sabe si esto sirve

**Antes del pitch, sin escribir código:**

- ~~Confirmar si DoraHacks ya ofrece calificación asistida.~~ **Resuelto (2026-08-07): sí, Hackathon AI está enviado.** Ver §3.
- Preparar la respuesta a "¿en qué son distintos de DoraHacks?". No improvisarla en el escenario. La respuesta es §3.1: ellos juzgan, nadie custodia ni ejecuta.

**Métrica de verdad del MVP** — una sola:

> **Grupos que crean un segundo pozo después de resolver el primero.**

Pozos creados mide curiosidad. El segundo pozo mide utilidad. 40 retos creados y 0 repeticiones es exactamente el fracaso que este documento intenta evitar.

---

## 9. Próximos pasos

**Bloqueantes:**

1. Cerrar el agujero de `winner` (§5.4), con la validación por lista de destinos declarados.
2. Decidir ratificación vs. automático (§5.2). Resuelve también §5.3. Es **la** decisión de diseño del producto.
3. Poner la frontera canal/dominio en el Worker (§6) **antes** de escribir el bot.

**Producto:**

4. Segmento ancla (§4): **comunidades online sin país común**. Hackathones se cuentan como ejemplo del problema, no como mercado objetivo.
5. Sacar del pitch tres argumentos que ya no se sostienen: "fricción cross-border" (UglyCash), "rendimiento" (falso a escala), "juicio asistido por IA" **a secas** (DoraHacks). Lo que queda y sí es cierto: **juicio + custodia + ejecución + veto en la misma pieza.**
6. Tener lista la respuesta a DoraHacks (§8).

**Deuda documental:**

7. Commitear el SDD al repo. `AGENTS.md` lo declara fuente de verdad y el código cita sus secciones (`§7.2`, `§8`, `§8.3`, `§11`), pero nunca estuvo versionado.
8. Alinear SDD §8.2 con el código: el SDD promete comisión dinámica sobre el rendimiento; `resolve_payout()` aplica un porcentaje plano sobre el total recuperado.

---

## 10. Lo que este documento NO afirma

- No hay dimensionamiento de mercado. No hay números y no se inventan.
- El segmento ancla del §4 es una recomendación, no un acuerdo del equipo.
- No hay confirmación de si UglyCash desarrolla los sobrecitos internamente o con un tercero.
- No está verificado si algún competidor combina juicio + custodia + ejecución. Es el hueco que reclama el §3.1 y **es ahora la afirmación más frágil del documento**. Vale una búsqueda más antes de pitchear.
- El MVP tal como está planificado **no tiene agente** (ver `docs/backend-plan.md`: "Modo juez con IA — roadmap, no MVP"). La demo mostrará consenso manual. Es defendible con el deadline encima, pero el pitch no puede afirmar lo que la demo no hace.
