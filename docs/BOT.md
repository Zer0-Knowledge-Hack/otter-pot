# Especificación del bot de Telegram — OtterPot

| Campo | Valor |
|---|---|
| Estado | v3 — corrige el armado de retos, unifica la colecta y agrega historial |
| Fecha | 2026-08-07 |
| Modelo de referencia | Rose: se agrega a cualquier grupo, cada admin lo configura a su gusto |
| Idioma de la interfaz | Español neutro (LatAm). Sin regionalismos que excluyan a otro país |
| Tono | `DESIGN.md` §1: cálido, claro, directo, con humor moderado |

> **Criterio:** se diseña la superficie **completa**. Si el bot se diseña alrededor de un subconjunto, la arquitectura se calcifica ahí y sumar depósitos, modos o colectas después obliga a rehacer. Lo que se escalona es la *implementación*, y cada comando está marcado con lo que lo bloquea.

---

## 1. Principios de diseño

1. **Se agrega, no se instala.** Cualquiera lo mete en su grupo y funciona sin registro previo.
2. **Cada grupo decide sus reglas.** Nada hardcodeado que un admin no pueda cambiar.
3. **El bot nunca custodia.** No tiene fondos. Propone, cuenta votos y relaya; el contrato guarda y paga.
4. **Nunca miente sobre lo que no sabe.** Si una wallet no está verificada, lo dice.
5. **Nada toca la cadena hasta que haga falta.** Armar un reto es gratis y reversible; solo el compromiso real se escribe on-chain.

---

## 2. 🔴 Lo que el contrato todavía no soporta

Va primero porque condiciona todo. Verificado en `challenge_pool/src/lib.rs`:

```rust
pub struct Challenge {
    creator, required_deposit, deadline, status, winner,
    treasury_shares, participant_count, deposited_count,
    participants, has_deposited, claimed_refund
}

pub fn create_challenge(required_deposit, deadline, participants_list) -> U256
```

| Caso de uso | Qué falta | Tamaño |
|---|---|---|
| **Modo juez** (`SDD` §6.4) | Campos `modo` y `juez`; parámetros en `create_challenge`; rama en `confirm_result` | Chico |
| **Colecta** | Lista de destinos declarados al crear. Hoy `confirm_result` exige ganador participante — correcto contra el drenaje, pero cierra el destino externo | Chico |
| **Cancelar tras depositar** | No hay salida desde `Abierto` on-chain. Si alguien depositó y el reto nunca se completa, esos fondos quedan atrapados | Chico |
| **Rendimiento real** | El adaptador de estrategia apunta a `0x0` | Grande |

> El **armado previo** (§4) elimina la mayoría de los casos del tercer punto: mientras el reto se arma no hay nada en la cadena, así que abandonarlo es gratis. El cambio de contrato solo hace falta para el caso raro de que alguien deposite y el reto nunca se llene.

---

## 3. Superficie completa de comandos

Leyenda: ✅ funciona hoy · 🔧 necesita cambio de contrato · 📱 necesita Mini App

### 3.1 Inicio y ayuda

| Comando | Dónde | Dep. | Qué hace |
|---|---|---|---|
| `/start` | Privado | ✅ | Presentación y primeros pasos |
| `/ayuda` | Ambos | ✅ | Comandos según contexto y rol |
| `/nutria` | Ambos | ✅ | Huevo de pascua |

### 3.2 Wallet e identidad

| Comando | Dónde | Dep. | Qué hace |
|---|---|---|---|
| `/vincular <0x…>` | Privado | ✅ | Asocia tu Telegram a una wallet |
| `/miwallet` | Ambos | ✅ | Muestra tu wallet (enmascarada en grupo) |
| `/desvincular` | Privado | ✅ | Borra la asociación |
| `/verificar` | Privado | 📱 | Vinculación firmada vía Privy |

> ⚠️ **Hoy `/vincular` no está verificado**: cualquiera puede declarar cualquier dirección. El bot lo advierte al vincular. Sirve entre conocidos, no para dinero ajeno.

### 3.3 Retos

| Comando | Dep. | Qué hace |
|---|---|---|
| `/nuevo [usdc] [horas] [opciones]` | ✅ | Abre el **armado** de un reto. Nada en la cadena todavía |
| `[Me sumo]` (botón) | ✅ | Te anota como participante del armado |
| `[Me bajo]` (botón) | ✅ | Te saca del armado |
| `/abrir [id]` | ✅ | Cierra la lista y **crea el reto en la cadena** |
| `/descartar [id]` | ✅ | Cancela un armado. Gratis: no hay nada on-chain |
| `/retos` | ✅ | Retos activos del grupo, con su estado |
| `/estado [id]` | ✅ | Pozo, depósitos, confirmaciones y plazo |
| `/depositar <id>` | 📱 | Enlace `t.me` a la Mini App para firmar el depósito (ver §9) |
| `/confirmar <id> @usuario` | ✅ | Registra tu voto por un ganador |
| `/reembolso <id>` | ✅ | Dispara el reembolso si venció el plazo |
| `/cancelar <id>` | 🔧 | Cancela un reto ya on-chain y devuelve lo depositado |
| `/historial [@usuario]` | ✅ | Retos jugados, ganados y total movido |

**Opciones de `/nuevo`:**

| Opción | Dep. | Efecto |
|---|---|---|
| `destino:0x…` | 🔧 | Convierte el reto en **colecta**: el pozo va a una wallet externa, sin comisión |
| `juez:@usuario` | 🔧 | Resuelve un árbitro en vez del consenso |
| `evidencia:si` | ✅ | Exige adjuntar prueba al confirmar |

> **La colecta no es un comando aparte.** Es el mismo primitivo con otro destino, tal como lo define `PRODUCT.md` §4: pozo + regla + destino. Darle comandos propios duplicaría la superficie y contradiría la arquitectura.

### 3.4 Configuración (solo admins)

| Comando | Dep. | Qué hace |
|---|---|---|
| `/config` | ✅ | Muestra toda la configuración del grupo |
| `/set umbral <mayoria\|unanimidad\|todos-menos-uno\|N>` | ✅ | Confirmaciones necesarias |
| `/set modo <consenso\|juez>` | 🔧 | Modo de resolución por defecto |
| `/set juez @usuario` | 🔧 | Árbitro por defecto |
| `/set deposito <usdc>` | ✅ | Monto por defecto |
| `/set plazo <horas>` | ✅ | Plazo por defecto |
| `/set crear <todos\|admins>` | ✅ | Quién puede abrir retos |
| `/set anuncios <si\|no>` | ✅ | Avisos de cambio de estado |
| `/set evidencia <no\|opcional\|obligatoria>` | ✅ | Nivel de prueba exigido al confirmar |
| `/reset` | ✅ | Vuelve a los valores por defecto |

---

## 4. El armado: por qué existe

**El bot no puede listar los miembros de un grupo.** La Bot API de Telegram no lo permite: hay `getChatMemberCount` y `getChatMember(user_id)`, pero ningún método para enumerar. Y el contrato exige la lista completa de participantes **al crear** (`create_challenge(…, participants_list)`).

Entonces la lista tiene que armarse antes, y con la gente anotándose sola:

```
/nuevo 25 24
    │
    ▼
┌─────────────────────────────────────────┐
│ 🦦 Reto en armado #a3                   │
│ 25 USDC · 24 h · consenso por mayoría   │
│ Anotados: @ana, @beto (2)               │
│         [ Me sumo ]  [ Me bajo ]        │
└─────────────────────────────────────────┘
    │
    │  /abrir a3   ← solo el creador
    ▼
Reto #7 creado en la cadena
```

Tres beneficios de paso:

1. **Abandonar es gratis.** Un armado que no prospera se descarta sin tocar la cadena — resuelve casi todo el pendiente #7 sin cambiar el contrato.
2. **Nadie escribe direcciones.** Te sumás con un botón; el bot usa tu wallet vinculada.
3. **El grupo ve quién está.** La lista es pública y se actualiza en vivo.

**Regla:** para sumarse hay que tener wallet vinculada. Si no la tenés, el bot te lo dice por privado con el `/vincular` listo para copiar.

---

## 5. Configuración por grupo

| Clave | Valores | Defecto |
|---|---|---|
| `umbral` | `mayoria`, `unanimidad`, `todos-menos-uno`, entero | `mayoria` |
| `modo` | `consenso`, `juez` | `consenso` |
| `juez` | id de Telegram | — |
| `deposito` | entero USDC | `10` |
| `plazo` | horas | `24` |
| `crear` | `todos`, `admins` | `todos` |
| `anuncios` | `si`, `no` | `si` |
| `evidencia` | `no`, `opcional`, `obligatoria` | `no` |

### 5.1 `modo` manda sobre `umbral`

Si `modo=juez`, el umbral **se ignora**: decide una sola persona. El bot lo avisa al configurarlo, para que nadie crea que puso una salvaguarda que no aplica.

### 5.2 El umbral resuelve un pendiente del equipo

El pendiente #10 era *«¿mayoría simple, unanimidad, todos menos uno?»*, planteado como decisión global. **Deja de serlo**: cada grupo elige según cuánto se conocen.

Es viable porque el contrato **no cuenta confirmaciones**: `confirm_result` recibe un ganador ya decidido y el conteo vive en `confirmations.ts`.

**Contracara honesta:** el umbral es una promesa del backend, no una garantía on-chain. Un operador comprometido podría ignorarlo. Lo que sí garantiza el contrato desde `a4128c7` es que el ganador sea participante — el peor caso es «gana el participante equivocado», no «se fuga el dinero».

### 5.3 Evidencia

Tres niveles. La prueba se guarda como `file_id` de Telegram —que ya aloja el archivo— así que no hace falta almacenamiento propio.

| Nivel | Efecto |
|---|---|
| `no` | Se confirma sin adjuntar nada |
| `opcional` | Se puede adjuntar; queda registrada junto al voto |
| `obligatoria` | Sin adjunto, el voto se rechaza |

Nadie la evalúa automáticamente todavía — no hay agente. Pero deja constancia y le da al grupo con qué discutir, que es exactamente lo que hoy falta cuando alguien dice «yo gané».

---

## 6. Ciclo de vida completo

```
/nuevo ──▶ Armado (solo en el bot) ──▶ /descartar  ✅ gratis
             │
             │ /abrir
             ▼
          Abierto ──────────────────▶ /cancelar  🔧
             │  cada quien deposita (firma propia 📱)
             ▼
         Bloqueado ──▶ el pozo pasa al TreasuryVault
             │
     ┌───────┼────────────────┐
     │       │                │
  umbral  juez decide 🔧   vence el plazo
     │       │                │
     ▼       ▼                ▼
      Resuelto             Reembolsado
   (paga al ganador)    (devuelve, sin comisión)
             │
             ▼
        /historial
```

---

## 7. Mensajes de error

Siempre con la acción siguiente:

| Situación | Mensaje |
|---|---|
| Sin wallet vinculada | «Todavía no vinculaste una wallet. Escribime por privado: `/vincular 0x…`» |
| Armado sin gente | «Nadie se sumó todavía. Necesitás al menos 2 para abrir el reto.» |
| No sos el creador | «Solo quien armó el reto puede abrirlo.» |
| No sos participante | «Este reto no te incluye. Solo confirman quienes pusieron plata.» |
| Reto inexistente | «No encuentro el reto {id} en este grupo. Mirá `/retos`.» |
| Falta evidencia | «Este grupo exige adjuntar prueba. Mandá la foto junto al `/confirmar`.» |
| Plazo vencido | «El plazo venció sin consenso. Cualquiera puede correr `/reembolso {id}`.» |
| Sin permiso | «Solo los admins del grupo pueden cambiar la configuración.» |
| Función no disponible | «Todavía no está habilitado. Va en la próxima versión del contrato.» |
| Error de cadena | «No pude escribir en la cadena: {motivo}. El estado del reto no cambió.» |

---

## 8. Orden de implementación

No es recorte de alcance: es orden de ejecución. Toda la superficie del §3 se enruta desde el día uno; lo que no está listo responde «todavía no disponible».

| Etapa | Contenido | Bloqueado por |
|---|---|---|
| **1** | Router completo + `/start`, `/ayuda`, `/vincular`, `/miwallet`, `/config`, `/set` | Nada |
| **2** | Armado con botones, `/abrir`, `/estado`, `/retos`, `/confirmar`, `/reembolso`, `/historial` | Nada |
| **3** | `/depositar`, `/verificar` | Mini App |
| **4** | `destino:`, `juez:`, `/cancelar` | Contrato (§2) |

Las etapas 1 y 2 dan un ciclo completo demostrable.

---

## 9. Notas de implementación

- **Webhook, no long polling.** Workers no sostiene conexiones largas.
- **Validar siempre** `X-Telegram-Bot-Api-Secret-Token` — ya está en `telegram.ts`.
- **Bot API con `fetch` directo**, sin framework.
- **`callback_query`**: los botones del armado requieren manejar ese tipo de update además de `message`. Hay que responder con `answerCallbackQuery` o Telegram muestra el reloj colgado.
- **🔴 Los botones `web_app` NO funcionan en grupos.** Telegram los admite solo en chats privados; en un grupo responde «Web app can be used in private chats only». Consecuencia directa para `/depositar`: en el grupo hay que mandar un **botón de tipo `url`** apuntando a `https://t.me/{bot}/{app}?startapp={challengeId}`, que abre la Mini App con el contexto del reto. Ese nombre corto `{app}` se obtiene registrando la Mini App con `/newapp` en @BotFather — o sea que `/newapp` **no es opcional** si el depósito se dispara desde el grupo.
- **Registro en @BotFather, en este orden:** `/newbot` primero (la Mini App se cuelga de un bot existente) y `/newapp` después, cuando ya exista una URL pública HTTPS. `/newgame` es otra cosa: la plataforma vieja de juegos HTML5 con puntajes, no tiene nada que ver con Mini Apps.
- **Comandos con sufijo**: en grupos llega `/estado@otterpot_bot`. Tolerarlo.
- **Estado** en KV o Durable Objects (`STACK.md` §2.3):
  - `grupo:{chat_id}:config`
  - `grupo:{chat_id}:armados` — retos en armado, con su lista de anotados
  - `grupo:{chat_id}:retos` — mapeo id local ↔ `challenge_id` on-chain
  - `usuario:{tg_id}:wallet`
  - `usuario:{tg_id}:historial`
- **Un Worker desplegado no ve `localhost`.** Mientras la cadena sea local: `wrangler dev` + túnel `cloudflared`.
- **El router se escribe completo desde el inicio**, con «no disponible» como caso explícito. Agregar una función después debe ser cambiar una rama, nunca reestructurar.
