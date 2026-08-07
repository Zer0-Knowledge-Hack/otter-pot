# Validación de la idea — OtterPot

| Campo | Valor |
|---|---|
| Estado | v1 — stress test antes de comprometer más construcción |
| Fecha | 2026-08-07 |
| Deadline del MVP | **8 de agosto 2026** (mañana) |
| Documento hermano | `docs/PRODUCT.md` — define qué es y para quién. Este define **si aguanta**. |

Este documento no defiende el proyecto. Intenta tumbarlo. Lo que quede en pie es sobre lo que se puede construir.

---

## 0. La restricción que ordena todo lo demás

**El deadline es mañana.** Eso divide este documento en dos horizontes, y confundirlos es la forma más rápida de perder las dos cosas:

| Horizonte | Qué se decide | Qué NO se decide |
|---|---|---|
| **Hoy → mañana** | Qué se demuestra, qué se dice en el pitch, qué agujero no se envía | Nada estratégico. No hay tiempo de pivotar y no hace falta |
| **Después del evento** | Segmento, cadena, modelo de negocio, si el proyecto sigue | Nada urgente |

Todas las preguntas de este documento se responden igual. Lo que cambia es **cuándo actuás sobre la respuesta.** Una pregunta marcada 🔵 no bloquea el MVP de mañana aunque la respuesta sea incómoda.

---

## 1. La idea, en una frase

> Un pozo de dinero de grupo, que vive en Telegram, donde un agente emite un veredicto sobre quién gana y las personas lo ratifican o lo vetan — y el contrato paga sin que nadie custodie los fondos.

**Lo que ya está construido** (verificado en el repo, no supuesto):

- `ChallengePool`, `TreasuryVault`, `mock_usdc` en Stylus, con tests y scripts de deploy.
- Worker: webhook de Telegram, conteo de confirmaciones, endpoint de estado.

**Lo que NO existe**: el agente, la Mini App, el bot conversacional, la landing, la integración Privy completa, el despliegue en Sepolia.

Es importante decirlo así de crudo: **hoy el proyecto es un pozo con resolución por consenso manual.** El agente —la pieza que lo diferencia— no está escrita y el propio `backend-plan.md` la declara fuera del MVP.

---

## 2. Las preguntas que pueden tumbarla

Ordenadas por qué tan rápido matan el proyecto.

### 2.1 🔴 "¿Por qué no lo hace Telegram nativamente, en TON?"

**Esta es la pregunta más peligrosa del documento y no la teníamos identificada.**

TON es la cadena nativa de Telegram. Los mini-apps Web3 de Telegram corren mayoritariamente ahí, con integración de wallet en el propio cliente, comisiones bajas y distribución directa a la base de usuarios. Todo el ecosistema de juegos y apuestas de Telegram vive en TON.

Un producto que se define como *"vive dentro de Telegram"* y elige una cadena que **no** es la de Telegram tiene que justificarlo. Y la justificación honesta hoy es: **porque el sponsor del track es Arbitrum.**

Eso es suficiente razón para la hackathon. **No es suficiente razón para el producto.** Ver §5.

**Estado: ABIERTA.** No bloquea el MVP. Bloquea cualquier decisión de seguir después.

### 2.2 🔴 "¿Esto no es un bot de apuestas más?"

El espacio de bots de apuestas y casinos en Telegram está **maduro y poblado** en 2026. Además, CryptoBot ya expone una API de facturación con la que se construyen escrows automatizados dentro de Telegram.

La diferencia real es doble, y hay que poder decirla en una frase:

1. Los casinos de Telegram son **casa contra jugador** y **custodios**: el bot tiene tu plata. Acá es **entre pares** y **no-custodio**: el contrato tiene la plata y nadie puede desviarla.
2. Ninguno **arbitra**. Un casino resuelve con un RNG; nosotros resolvemos un hecho del mundo real que hay que juzgar.

**Estado: RESPONDIDA**, con la advertencia de que "es como un bot de apuestas" será la primera impresión de todo el mundo y hay que desarmarla proactivamente.

### 2.3 🔴 "Yape, Takenos o UglyCash ya mandan plata gratis entre usuarios. ¿Para qué esto?"

Es la pregunta correcta y ya mató uno de nuestros argumentos. [Takenos](https://takenos.com/) mueve más de US$500M en pagos cross-border con stablecoin propia, 500 mil usuarios en 20 países, sin comisiones. [Vita Wallet](https://vitawallet.io/) opera desde Chile, Colombia y Argentina hacia más de 50 destinos. Y varias de estas fintechs **ya tienen rampas de entrada y salida a moneda local**.

**Si el problema fuera mover dinero, está resuelto y nosotros sobramos.** También hay que decirlo con todas las letras: esas rampas debilitan el argumento de El Dorado (`PRODUCT.md` §7) — no somos los únicos con una salida a moneda local.

Un reto entre amigos se organiza de dos formas, y hay que analizar las dos:

**Forma A — pozo centralizado.** Todos le mandan a alguien que guarda. Ese alguien puede gastárselo, olvidarse o desaparecer.

**Forma B — cada uno aparta lo suyo.** Todos acuerdan US$5, cada uno los **aparta en su propia cuenta**, y al terminar el reto cada quien le transfiere sus US$5 al ganador. Sin intermediario, directo al destinatario.

La forma B es la que hay que tomar en serio, porque con estas fintechs funciona: costo cero, entre países, con rampa local. **Es una alternativa real y hoy hace casi todo lo que nosotros queremos hacer.**

Dónde es *mejor* que nosotros, y conviene admitirlo antes de que lo diga otro:

- No hay lockup. Tu plata sigue siendo tuya hasta el final: sin costo de oportunidad y sin riesgo de contrato.
- Es más simple. Sin wallet, sin gas, sin USDC, sin aprender nada.

Dónde se rompe:

1. **En la forma B, el pozo no existe.** "Apartar en tu propia cuenta" no es un compromiso: es una intención. Nadie puede verificar que apartaste nada. Podés entrar a un reto de 10 personas con cero dólares en la cuenta y nadie se entera hasta el final.
2. **No hay solvencia garantizada.** Ganás un "pozo de US$50" y cobrás US$30, porque cuatro de los diez no pagaron. El pozo es ficticio hasta la liquidación.
3. **El que pierde no paga.** Es el mismo agujero de la forma A vista desde el otro lado, y es el modo de falla universal de cualquier apuesta entre amigos.

Una transferencia a costo cero no obliga a nadie a hacerla. **La diferencia no es el costo: es que el dinero esté bloqueado antes de que se sepa el resultado.**

Tres matices honestos que achican nuestra ventaja:

- Entre amigos cercanos, la presión social **ya funciona** como mecanismo de cobro. Ese segmento no nos necesita (`PRODUCT.md` §4) — no porque seamos caros, sino porque no hay nada que arreglar.
- El argumento "todos tienen que bajarse la misma app" es **más débil de lo que veníamos diciendo**. Para cinco amigos, instalar Takenos una vez es un costo trivial. Nuestra ventaja de distribución es real en **comunidades grandes** —donde no podés coordinar que 200 personas instalen nada— y es floja en grupos chicos.
- La forma B ya resuelve interoperabilidad y costo. Lo único que no resuelve es la ejecución.

**Estado: RESPONDIDA, y reduce la propuesta de valor a una sola cosa.** No damos rieles más baratos, ni acceso cross-border, ni rampa local: todo eso existe. Damos **un pozo que se puede verificar y que se ejecuta solo**.

### 2.4 🔴 "¿Esto no es Polymarket?"

Un jurado de este ecosistema la va a hacer, y hay una parte donde tiene razón.

**Donde tiene razón:** si la apuesta es *"quién gana el partido del domingo"*, eso **es** un mercado de predicción, y Polymarket lo hace mejor, con liquidez real y años de ventaja. **Ese caso de uso no es nuestro y hay que decirlo así, sin pelearlo.**

**Donde no:** Polymarket resuelve mediante el oráculo optimista de UMA, y cada mercado se define como *"resuelve SÍ si [evento específico y verificable] según [fuente definida]"*. **Necesita una fuente pública.**

Cinco amigos cocinando panqueques no tienen fuente pública. Nadie publica quién caminó más kilómetros esta semana. **Los eventos privados no tienen oráculo** — y ahí es donde vive todo nuestro producto.

Las dos diferencias estructurales:

| | Polymarket | OtterPot |
|---|---|---|
| Quién produce el resultado | Un tercero (el mundo) | **Los propios participantes** |
| Contraparte | Anónima, vía mercado | Conocida, pozo fijo |
| Fuente de verdad | Pública y verificable | **No existe — hay que arbitrarla** |
| Tu rol | Espectador que predice | **Protagonista que ejecuta** |

**Y una corrección importante sobre nuestro propio diseño:** la "ventana de veto" que propone `PRODUCT.md` §5.2 **es exactamente el patrón de oráculo optimista de UMA** — proponer, ventana de disputa, y jurado solo si alguien objeta.

Eso no es malo, es bueno: el mecanismo está probado a escala y con dinero real. Pero **no es nuestra invención y un jurado que conozca UMA lo va a reconocer al instante.** Conviene nombrarlo nosotros primero:

> *"Usamos el patrón de oráculo optimista, igual que Polymarket. La diferencia es que ellos lo aplican a eventos públicos y nosotros a eventos privados que los propios participantes producen."*

Decirlo así demuestra que conocés el terreno. Ocultarlo y que te lo señalen demuestra lo contrario.

**Estado: RESPONDIDA**, con una frontera explícita que hay que respetar: evento público → mercado de predicción, no nosotros.

### 2.5 🔴 "El agente no existe todavía. ¿Qué están demostrando?"

Si el diferenciador es el juicio asistido y el MVP resuelve por consenso manual, lo que se demuestra es **la mitad no diferenciada del producto** — que es justo la mitad que UglyCash ya envió.

No es fatal si se dice con honestidad: *"hoy demostramos la custodia y la ejecución verificables; el veredicto asistido es lo siguiente y la arquitectura ya lo contempla"*. Es fatal si el pitch afirma un agente que la demo no muestra. Un jurado lo pide en vivo y ahí se acaba.

**Estado: ABIERTA — y es la decisión de pitch más importante de mañana.**

### 2.6 🟡 "¿Qué pasa cuando el agente se equivoca?"

Un modelo juzgando evidencia ambigua, moviendo dinero irreversible. La respuesta tiene que existir antes de que la pregunte alguien más: **ratificación humana siempre, con ventana de veto.** El agente propone; el grupo dispone.

Si no hay respuesta a esto, el producto no es defendible ante nadie que maneje riesgo.

**Estado: RESPONDIDA en diseño** (`PRODUCT.md` §5.2), no en código.

### 2.7 🟡 "¿Y si el ganador simplemente no confirma?"

Hoy el reembolso devuelve capital más rendimiento sin comisión al vencer el plazo. Para quien pierde, **callarse es estrategia dominante**: recupera su plata con intereses. Un reto donde nadie puede perder no es una apuesta.

La ventana de veto lo resuelve: si el silencio **ratifica** en lugar de bloquear, desaparece el incentivo.

**Estado: RESPONDIDA en diseño, ABIERTA en código.**

### 2.8 🟡 "¿Cuánto rendimiento genera realmente?"

En un reto de 3 días por $20, céntimos. Y como la comisión sale del rendimiento y, si no alcanza, del capital, **el ganador recibe menos de lo que el grupo puso.**

No mencionar rendimiento como argumento de venta. Es cierto solo en horizontes de semanas o meses.

**Estado: RESPONDIDA.** Acción: sacarlo del pitch.

### 2.9 🔵 "¿Alguien lo usaría dos veces?"

No hay evidencia. Cero usuarios. El hábito existe (los sobrecitos de UglyCash lo prueban), pero que exista el hábito no prueba que lo quieran hacer **acá**.

**Estado: ABIERTA. No se puede responder antes de mañana y no hace falta.** Se responde con la métrica del §7.

---

## 3. Qué hay en el mercado

Verificado, no supuesto.

| Producto | Custodia | Juzga | Ejecuta pago | Dónde vive |
|---|---|---|---|---|
| [UglyCash](https://global.techradar.com/es-mx/pro/finanzas-sin-fronteras-uglycash-aterriza-en-mexico-con-su-app-basada-en-stablecoins) (sobrecitos) | Sí (custodio) | No — buena fe | Sí | App propia |
| [DoraHacks Hackathon AI](https://dorahacks.io/blog/guides/hackathon-ai) | No | **Sí** | No | Portal propio |
| [Devpost](https://info.devpost.com/product/ai-hackathons) | No | Sí | No | Portal propio |
| [Vaquita](https://www.vaquita.fi/) (Stellar/Scroll) | Sí | No hay qué juzgar | Sí | App propia |
| [PoolTogether](https://pooltogether.com/) | No-custodio | No hay qué juzgar | Sí | dApp |
| Casinos/bots de Telegram | Sí (custodio) | RNG, no arbitraje | Sí | **Telegram** |
| CryptoBot (escrow API) | Sí (custodio) | No | Sí | **Telegram** |
| [Polymarket](https://help.polymarket.com/en/articles/13364518-how-are-prediction-markets-resolved) | No-custodio | Sí, oráculo UMA — **solo eventos públicos** | Sí | dApp |
| [Takenos](https://takenos.com/) / [Vita Wallet](https://vitawallet.io/) / fintechs LatAm | Sí (custodio) | No | Transferencia, no arbitraje | App propia |
| **OtterPot** | **No-custodio** | **Sí (planeado) — eventos privados** | **Sí** | **Telegram** |

### 3.1 El hueco, dicho con precisión

Nadie ocupa la fila completa: **no-custodio + arbitraje + ejecución + dentro de Telegram.**

Pero seamos honestos sobre el tamaño del hueco: **cada pieza individual existe y está madura.** La novedad es la combinación, no ninguna de las partes. Eso importa porque una combinación es mucho más fácil de copiar que una invención.

---

## 4. ¿Qué probabilidad hay de que alguien lance esto primero?

Evaluación honesta, sin optimismo:

| Actor | Probabilidad | Por qué |
|---|---|---|
| **UglyCash** | **Alta** | Ya tiene sobrecitos, retos, custodia, stablecoins y cross-border. Agregarle arbitraje asistido es una feature, no un producto nuevo. Es el competidor natural |
| Bots de casino en Telegram | Media | Tienen la distribución y la infraestructura de pagos. Les falta el ángulo P2P no-custodio, que va contra su modelo de negocio |
| DoraHacks | Baja | Ya tiene el juicio; agregar custodia lo mete en territorio regulatorio que no le interesa |
| Vaquita / PoolTogether | Baja | Producto de ahorro, no de disputa |

**Conclusión incómoda:** el foso es delgado. No hay tecnología difícil de replicar acá — hay una combinación bien elegida. La única defensa real es **llegar primero al grupo y quedarse**, que es exactamente lo que mide la métrica del §7.

Esto no invalida el proyecto. Sí invalida cualquier narrativa de "nadie puede hacer esto".

---

## 5. ¿Por qué Arbitrum?

### 5.1 La razón real

De la reunión: *"debemos vender el charque porque el sponsor oficial es árbitro, nada más."*

Es la razón honesta y es legítima para una hackathon. Pero no sobrevive a la pregunta del §2.1, así que conviene saber qué queda si se saca el sponsor de la ecuación.

### 5.2 Lo que sí justifica Arbitrum, independientemente del track

- **Stylus permite escribir los contratos en Rust.** En 2026 el ecosistema pasó de experimental a infraestructura de producción, con tooling de Hardhat 3 y compatibilidad de estado con contratos EVM. Es una ventaja real de equipo si Rust es donde son fuertes.
- **Liquidez de USDC** madura, que TON no tiene al mismo nivel.
- **El Dorado corre sobre Arbitrum**, y es la vía de salida a moneda local en LatAm. Esto es el argumento más fuerte y es específico del mercado objetivo.
- **Interoperabilidad EVM**: la puerta a otras cadenas queda abierta sin reescribir.

### 5.3 Lo que Arbitrum cuesta

- **TON tiene integración de wallet nativa en el cliente de Telegram.** Nosotros necesitamos Privy para tapar ese hueco — que es, no por casualidad, uno de los bloqueantes vivos del backend.
- La distribución Web3 dentro de Telegram ya está en TON.

**Veredicto:** Arbitrum es defendible por El Dorado, USDC y Rust. **No** es defendible con "es más barato" ni "es interoperable" — eso lo dice cualquiera. Si después del evento el producto se queda en Telegram, esta decisión hay que reabrirla en serio.

---

## 6. ¿El uso de blockchain está fundamentado?

La prueba correcta no es "¿se puede hacer con blockchain?" sino **"¿qué se rompe si lo saco?"**.

Versión web2 honesta: un bot de Telegram con una pasarela que retiene el dinero hasta que el grupo decida. Técnicamente trivial. Lo que se rompe:

| Sin blockchain | Consecuencia |
|---|---|
| Alguien retiene fondos de terceros | Transmisor de dinero: licencia, KYC/AML, país por país. Inviable para un equipo de 4 |
| El grupo confía en la empresa | Se reintroduce el punto de falla que el producto promete eliminar |
| El veredicto vive en un servidor privado | No es auditable; el veto no es ejecutable, es una promesa |
| Las rieles no cruzan fronteras | El segmento ancla (comunidades sin país común) desaparece |

**Veredicto: SÍ, fundamentado — pero solo para la custodia y la ejecución.**

Y hay que ser preciso, porque acá es donde la mayoría de los proyectos mienten: **el juicio del agente NO necesita blockchain.** Correr un modelo sobre evidencia se hace en cualquier servidor. Lo que necesita la cadena es que el resultado sea **vinculante, auditable y vetable** sin un intermediario de confianza.

La frase defendible: *la cadena no piensa, ejecuta lo que el grupo ratificó.*

---

## 7. ¿Por qué es innovadora y qué cambia?

### 7.1 Afirmación honesta

**No es una invención. Es una recombinación.** Todas las piezas existen: escrow en Telegram, juicio por IA, pozos no-custodios, stablecoins cross-border. Lo que no aparece ensamblado es las cuatro juntas.

Decirlo así es más fuerte que inflarlo, porque es verificable y no se cae bajo escrutinio.

### 7.2 Qué cambia concretamente

El problema, dicho en cinco palabras: **el pozo no existe todavía.**

Mover dinero ya es gratis y ya cruza fronteras — Yape, Takenos, UglyCash, Vita Wallet, con rampas locales incluidas. Pero en un reto organizado con esas herramientas, **el pozo es una promesa de N personas**, no un hecho. Nadie puede verificar que los otros apartaron nada, nadie puede obligarlos a pagar, y el ganador descubre cuánto ganó recién al final.

Entre amigos cercanos, la presión social cobra la deuda y esto no es un problema. **Entre desconocidos no hay quien cobre**, y por eso las comunidades online simplemente no hacen esto: no es que sea caro, es que no es cobrable.

El cambio: **convertir el pozo de promesa en hecho**, y separar quién guarda de quién decide sacando a ambos de manos humanas. El contrato guarda —el dinero está bloqueado y es verificable antes de que se sepa el resultado—, el agente propone, el grupo ratifica.

Eso convierte "apostar con desconocidos" de imposible a rutinario. Es un cambio modesto y real. No cura el cáncer; abre un caso de uso que hoy no existe.

---

## 8. Metas inalcanzables para el deadline

Lo que **no** va a estar mañana, dicho ahora para que el pitch no lo prometa:

| Pieza | Estado | ¿Alcanzable? |
|---|---|---|
| Contratos desplegados en Sepolia | Listos, sin desplegar | **Sí** |
| Consenso en el worker | Hecho | **Sí** |
| `confirm_result` end-to-end | Bloqueado por dirección + ABI | **Sí, si se desbloquea hoy** |
| Fix de seguridad de `winner` | No empezado | **Sí — es corto** |
| Bot conversacional usable | No empezado | Ajustado |
| Identidad vía Privy | Bloqueado sin App ID | **No** |
| Mini App pulida | No empezada | **No** |
| Agente / juicio asistido | Fuera de alcance por decisión | **No** |
| Integración de yield real | Fuera de alcance | **No** |
| El Dorado | Sin contacto confirmado | **No** |

**MVP honesto para mañana:** un pozo no-custodio en Telegram, con resolución por consenso, ejecutándose en Arbitrum Sepolia, y una arquitectura que muestra dónde entra el agente.

Eso es demostrable, es verdad, y es suficiente. Lo que hunde proyectos en el escenario no es un alcance chico — es un alcance chico presentado como grande.

---

## 9. Próximos pasos

### Antes del deadline (en este orden)

1. **Cerrar el agujero de `winner`** (`PRODUCT.md` §5.4). Es corto y es lo único que no se puede enviar roto: hoy el operador puede pagar a cualquier dirección.
2. **Desplegar en Sepolia** y pasarle dirección + ABI a quien hace el worker. Desbloquea W3.1.
3. **Escribir el guion del pitch con el alcance real del §8.** Sin agente, sin rendimiento, sin cross-border como argumento.
4. **Preparar la respuesta a las cinco preguntas de jurado**, todas resueltas en §2: DoraHacks (§3), TON (§2.1), billeteras gratis (§2.3), Polymarket (§2.4), y "¿qué pasa si el agente se equivoca?" (§2.6). Ensayarlas en voz alta — la de Polymarket especialmente, porque la respuesta correcta incluye conceder terreno.

### Después del evento (no antes)

5. Decidir TON vs Arbitrum con la pregunta del §2.1 sobre la mesa.
6. Implementar la ventana de veto (patrón de oráculo optimista, §2.4) — resuelve §2.6 y §2.7 de una vez.
7. Correr la métrica de verdad: **grupos que crean un segundo pozo después de resolver el primero.** Pozos creados mide curiosidad; el segundo pozo mide utilidad.
8. Hablar con 10 personas del segmento ancla antes de escribir una línea más de producto.

---

## 10. Veredicto

**La idea aguanta, con tres condiciones:**

1. Que el pitch no afirme lo que la demo no hace (§2.5).
2. Que no se envíe el agujero de seguridad (§9.1).
3. Que después del evento se responda honestamente la pregunta de TON (§2.1).

**Lo que NO aguanta y hay que dejar de decir:** que resolvemos fricción de pagos (Yape, Takenos, UglyCash lo hacen gratis), que damos acceso cross-border o rampa local (las fintechs ya la tienen), que generamos rendimiento (falso a escala), que el juicio asistido por IA es nuevo (DoraHacks), que la ventana de veto es un mecanismo original (es el oráculo optimista de UMA), y que nadie puede copiarlo (el foso es delgado).

**Lo que sí es verdad y alcanza:**

> Hoy el pozo de un reto es una promesa de N personas: nadie puede verificar que apartaron la plata, ni obligarlos a pagar.
> Nosotros lo convertimos en un hecho verificable que se ejecuta solo — dentro del lugar donde el grupo ya está.
