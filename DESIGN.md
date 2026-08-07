# Guía de Diseño de OtterPot

Este documento establece las directrices visuales y de experiencia de usuario para todos los componentes de OtterPot: la landing page, la Mini App de Telegram, el bot y los materiales de marketing. Es la referencia única para diseñadores y desarrolladores.

---

## 1. Identidad de Marca

### Nombre

**OtterPot**

### Eslogan (tagline) — PENDIENTE, no usar todavía

> ⚠️ El nombre, la mascota y la paleta están definidos. **El eslogan no.**
>
> "Retos que crecen juntos" afirma que el pozo crece, y a escala del MVP eso es falso: el rendimiento de un reto corto y de monto bajo es de céntimos, y la comisión se descuenta primero del rendimiento y luego del capital (SDD §8.2). El ganador puede recibir **menos** de lo que el grupo depositó.
>
> No llevar este eslogan a la landing ni al pitch hasta que sea verdad o hasta elegir otro. Ver `docs/VALIDATION.md` §2.8.

*"Retos que crecen juntos"*  
*(Alternativas en inglés: "Challenges that grow together", "Pool your goals", "Grow with the flow")*

### Valores de marca

- **Confianza amigable:** Somos serios con los fondos, pero accesibles y divertidos.
- **Comunidad:** Potenciamos los retos entre amigos y grupos.
- **Transparencia:** Todo es verificable en la blockchain.
- **Innovación lúdica:** Usamos tecnología de punta (Arbitrum Stylus) con una cara amable.

### Tono de comunicación

- Cálido y cercano.
- Optimista y motivador.
- Claro y directo (sin jerga técnica innecesaria).
- Con un toque de humor y sorpresa.

---

## 2. Paleta de Colores

La paleta se basa en la complementariedad del naranja y el azul, generando contraste y dinamismo.

| Color | Nombre | Código HEX | Uso principal |
| :--- | :--- | :--- | :--- |
| **Naranja principal** | `Orange` | `#FF6B35` | Botones primarios, elementos de acción, acentos, mascota. |
| **Naranja oscuro** | `Dark Orange` | `#E5533D` | Hover de botones, títulos destacados. |
| **Naranja claro** | `Light Orange` | `#FFE0D0` | Fondos suaves, tarjetas de retos. |
| **Azul marino** | `Navy` | `#1D3557` | Textos principales, encabezados, fondos de secciones. |
| **Azul medio** | `Medium Blue` | `#457B9D` | Botones secundarios, enlaces, detalles. |
| **Azul claro** | `Light Blue` | `#A8DADC` | Fondos de acento, separadores, badges. |
| **Blanco** | `White` | `#FFFFFF` | Fondos generales, textos sobre fondos oscuros. |
| **Gris claro** | `Light Gray` | `#F8F9FA` | Fondos alternativos, áreas de lectura. |

### Reglas de aplicación (regla 60-30-10)

- **60% Blanco y Azul claro:** Fondos, áreas de lectura, espacios negativos.
- **30% Azul marino y Naranja claro:** Encabezados, tarjetas, elementos estructurales.
- **10% Naranja principal y Azul medio:** Botones de acción, iconos, elementos interactivos.

---

## 3. Tipografía

Se recomienda usar una familia de fuentes sans-serif, moderna y legible.

### Fuentes principales

- **Títulos y encabezados:** `Poppins` (Google Fonts) – limpia, geométrica y amigable.
- **Cuerpo de texto y UI:** `Inter` (Google Fonts) – excelente legibilidad en pantalla.

### Alternativas de respaldo

- `system-ui`, `-apple-system`, `BlinkMacSystemFont`, `"Segoe UI"`, `Roboto`, `sans-serif`.

### Jerarquía tipográfica

- **H1 (título principal):** Poppins, peso 700, tamaño 2.5rem–3.5rem, color Navy.
- **H2 (subtítulos):** Poppins, peso 600, tamaño 2rem, color Navy.
- **H3 (títulos de sección):** Poppins, peso 600, tamaño 1.5rem, color Navy o Dark Orange.
- **Cuerpo:** Inter, peso 400, tamaño 1rem, color Navy.
- **Etiquetas y textos pequeños:** Inter, peso 400, tamaño 0.875rem, color Medium Blue o Gray.

---

## 4. Mascota: La Nutria

La nutria es el elemento central de la identidad visual. Debe transmitir **alegría, confianza y dinamismo**.

### Características físicas

- **Especie:** Nutria de río (estilizada).
- **Color principal:** Naranja (`#FF6B35`) en el cuerpo, con vientre y hocico en blanco (`#FFFFFF`) o crema (`#FFF5E6`).
- **Detalles en azul:** Ojos en Azul medio (`#457B9D`) o vibrante (`#2563EB`). Puede llevar una pequeña banda o collar en Azul marino (`#1D3557`).
- **Postura recomendada:** De pie o nadando, sosteniendo una **olla pequeña (pot)** con sus patas delanteras, o bien, emergiendo de una olla gigante. Esta acción refuerza el nombre y la funcionalidad de "guardar valor".
- **Expresión:** Sonrisa amplia y amigable, ojos brillantes y curiosos.

### Estilo gráfico

- Vectorial, con trazos redondeados y suaves.
- Estilo "flat design" con sombras suaves (o sin sombras, para mantener la simplicidad).
- Debe funcionar bien en tamaños pequeños (icono de app) y grandes (banner).

### Variantes de la mascota

- **Completa:** Cuerpo entero con la olla.
- **Rostro:** Solo la cara (para favicon o icono de perfil).
- **Silueta:** Versión monocromática para fondos de color.

---

## 5. Logo

El logo combina la mascota con el nombre de la marca.

### Versión principal (horizontal)

- **Elementos:** Nutria (a la izquierda) + texto "OtterPot" (a la derecha).
- **Color de texto:** La palabra "Otter" en Naranja (`#FF6B35`) y "Pot" en Azul marino (`#1D3557`), o toda la palabra en Naranja con algún detalle azul (ej. la "O" con forma de olla).
- **Uso:** Landing page, encabezados, presentaciones.

### Versión icono (cuadrada)

- **Elementos:** Solo el rostro de la nutria o su silueta con la olla.
- **Uso:** Favicon, icono de la Mini App, avatar de Telegram, redes sociales.

### Versión monocromática

- **Blanco sobre fondo de color:** Para usar sobre fondos Naranja o Azul marino.
- **Negro sobre fondo blanco:** Para impresiones o usos en blanco y negro.

### Espacio de respeto

Mantener un área de seguridad alrededor del logo equivalente al ancho de la "O" de "Otter" en todos los lados.

---

## 6. Directrices de Interfaz de Usuario (UI)

### Componentes principales

#### Botones

- **Primario:** Fondo Naranja (`#FF6B35`), texto Blanco, bordes redondeados (radio 8px). Hover: Naranja oscuro (`#E5533D`).
- **Secundario:** Fondo Azul medio (`#457B9D`), texto Blanco. Hover: Azul marino (`#1D3557`).
- **Outline:** Borde Naranja, texto Naranja, fondo transparente. Hover: fondo Naranja claro.
- **Deshabilitado:** Fondo Gris claro, texto Gris.

#### Tarjetas de retos

- Fondo Blanco, sombra suave (box-shadow: 0 4px 6px rgba(0,0,0,0.05)).
- Borde superior en Naranja o Azul según el estado del reto.
- Título en Azul marino, monto en Naranja.

#### Formularios

- Campos de entrada con borde Azul claro (`#A8DADC`), enfoque en Azul medio.
- Etiquetas en Azul marino.

#### Iconografía

- Usar un set de iconos lineal y consistente (ej. Phosphor Icons, Feather Icons).
- Color de iconos: Azul medio (#457B9D) o Naranja para acciones principales.

### Accesibilidad

- Contraste mínimo de 4.5:1 para texto normal y 3:1 para texto grande (WCAG AA).
- Probar con herramientas como WebAIM Contrast Checker.
- Los elementos interactivos deben tener un estado de enfoque visible (outline).

---

## 7. Aplicaciones específicas

### Landing Page (Next.js)

- Fondo principal: Blanco.
- Sección hero: Fondo degradado de Naranja claro a Azul claro, o una ilustración de la nutria.
- Llamada a la acción (CTA): Botón Naranja grande con texto "Crear reto" o "Empieza ahora".
- Sección de características: Tarjetas blancas con iconos azules.
- Pie de página: Azul marino, texto blanco.

### Mini App de Telegram

- Fondo principal: Blanco o Gris claro.
- Barra de navegación inferior: Azul marino con iconos blancos.
- Lista de retos: Tarjetas blancas con bordes de color según estado.
- Pantalla de depósito: Fondo blanco con botón Naranja prominente.

### Bot de Telegram

- Mensajes: Texto en Azul marino, con palabras clave en Naranja o negritas.
- Botones en los mensajes: Estilo inline con colores de la marca.
- Imagen de perfil del bot: Icono cuadrado de la nutria.

---

## 8. Ejemplos de aplicación de color en componentes

| Componente | Fondo | Texto | Borde / Acento |
| :--- | :--- | :--- | :--- |
| Botón "Depositar" | Naranja (#FF6B35) | Blanco | - |
| Botón "Ver reto" | Azul medio (#457B9D) | Blanco | - |
| Título de reto | - | Azul marino (#1D3557) | - |
| Monto del pozo | - | Naranja (#FF6B35) | - |
| Badge "Activo" | Naranja claro (#FFE0D0) | Naranja oscuro (#E5533D) | - |
| Badge "Finalizado" | Azul claro (#A8DADC) | Azul marino (#1D3557) | - |
| Input de texto | Blanco | Azul marino | Borde Azul claro |
| Footer | Azul marino (#1D3557) | Blanco | - |

---

## 9. Recursos y herramientas

- **Fuentes:** Google Fonts (Poppins, Inter).
- **Iconos:** Phosphor Icons o Feather Icons.
- **Generador de paletas:** Coolors.co.
- **Mockups:** Figma (para diseño), Canva (para marketing).
- **Guía de accesibilidad:** WebAIM.

---

## 10. Historial de cambios

- **v1 (2026-08-06):** Creación del documento con la identidad visual completa.
- **v2 (2026-08-07):** Se confirman como definitivos el nombre (OtterPot), la mascota (nutria con olla) y la paleta naranja/azul; el SDD y las guías de agentes se alinean con ellos. El eslogan queda marcado como pendiente por contradecir el modelo de comisiones (§1).
