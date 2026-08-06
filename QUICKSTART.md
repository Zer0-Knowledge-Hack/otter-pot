# Quick Start para OtterPot

Esta guía te llevará desde la clonación del repositorio hasta tener el entorno de desarrollo listo para empezar a codificar con OpenSpec y open-agent-hub.

---

## 1. Prerrequisitos

Antes de empezar, asegúrate de tener instalado:

- **Git** – [Descargar](https://git-scm.com/)
- **Node.js** v20.19.0 o superior – [Descargar](https://nodejs.org/) (o usa `nvm`, `fnm`)
- **Rust** + **Cargo** – [Instalar](https://rustup.rs/) (para los contratos Stylus)
- **Wrangler** – `npm install -g wrangler` (para el worker de Cloudflare)
- **Gestor de paquetes** – Recomendamos **bun** o **pnpm** por rapidez y seguridad. Si usas `bun`:

  ```bash
  curl -fsSL https://bun.sh/install | bash
  ```

  Si usas `pnpm`:

  ```bash
  npm install -g pnpm
  ```

> **Nota para Windows**: Si usas WSL, sigue las instrucciones dentro de tu distribución Linux. Si usas PowerShell/CMD directamente, necesitarás permisos de administrador para crear enlaces simbólicos (más abajo se explica).

---

## 2. Clonar el repositorio

```bash
git clone https://github.com/moises-cisneros/otter-pot.git
cd otter-pot
```

---

## 3. Instalar dependencias del monorepo

Cada paquete tiene su propio gestor; ejecuta desde la raíz:

### Si usas `bun`

```bash
# Instalar dependencias de todos los workspaces (si hay package.json en cada uno)
bun install
```

### Si usas `pnpm`

```bash
pnpm install
```

### Si usas `yarn` (clásico)

```bash
yarn install
```

> Los contratos Stylus usan `cargo`, no necesitan npm. El worker y nextjs tienen sus propios `package.json`; el comando anterior los instalará.

---

## 4. Instalar OpenSpec (global)

OpenSpec proporciona los comandos slash para planificar y gestionar cambios.

```bash
npm install -g @fission-ai/openspec@latest
```

Verifica que está instalado:

```bash
openspec --version
```

---

## 5. Configurar open-agent-hub (skills, agents y commands)

open-agent-hub te da acceso a decenas de skills (ej. `rust-audit`, `wrangler-deploy`, `commit`, `test-driven-development`, etc.) que potencian a tu asistente de IA.

### 5.1 Clonar open-agent-hub en una ubicación fija

Elige una carpeta donde quieras tener el repositorio (ej. `~/open-agent-hub` o `D:\Programas\open-agent-hub`).

```bash
git clone https://github.com/guanyang/open-agent-hub.git ~/open-agent-hub
cd ~/open-agent-hub
```

### 5.2 Enlazar el CLI globalmente

```bash
npm link
```

Esto registrará el comando `oah` (y sus alias) en tu sistema.

### 5.3 Volver al proyecto y habilitar los componentes

```bash
cd /ruta/a/tu/otter-pot   # o simplemente cd - si estabas en ~/open-agent-hub
oah enable --target=claude --target=antigravity --target=cursor --target=opencode --target=codex
```

> **En Windows (sin WSL)**: si obtienes un error `EPERM: operation not permitted`, abre PowerShell/CMD como **Administrador** y vuelve a ejecutar `oah enable`. También puedes activar el **Modo Desarrollador** en Windows (Configuración → Privacidad y seguridad → Para desarrolladores) para evitar este problema en el futuro.

### 5.4 Verificar que los enlaces se crearon

Revisa que en las carpetas `.claude/`, `.cursor/`, `.opencode/` y `.agent/` existan subcarpetas `skills/`, `agents/`, `commands/` con archivos.

```bash
ls -la .claude/skills   # Deberías ver muchos enlaces a ~/open-agent-hub/skills/
```

---

## 6. Configurar variables de entorno (si las hay)

El proyecto usa variables de entorno para claves de RPC, secretos de Privy, etc. **Nunca las subas al repositorio**.

Crea un archivo `.env` en la raíz (o en `packages/worker/` según corresponda) con el siguiente formato (ejemplo):

```env
# Archivo .env (no versionado)
ARBITRUM_RPC_URL=https://sepolia-rollup.arbitrum.io/rpc
PRIVY_APP_ID=tu_app_id
PRIVY_APP_SECRET=tu_app_secret
```

Pide a tu equipo que te solicite estos valores de forma segura (ej. por mensaje directo o mediante un gestor de secretos).

---

## 7. Verificar que los comandos slash funcionan

Abre tu asistente de IA favorito (Cursor, Claude Code, Antigravity u OpenCode) y escribe en el chat:

- Para **Cursor/OpenCode/Antigravity**: `/opsx:explore`
- Para **Claude Code**: `/opsx:explore` (o `@opsx:explore`)

Deberías recibir una respuesta del asistente diciendo que está listo para explorar ideas. Si no ves el comando, reinicia tu IDE o verifica que los archivos de comandos estén en `.cursor/commands/` o `.claude/commands/`.

---

## 8. Flujo de trabajo básico con OpenSpec + oah

### Crear un nuevo cambio (planificar)

```
/opsx:propose "Diseñar la landing page de OtterPot"
```

Esto generará la carpeta `openspec/changes/nombre-del-cambio/` con `proposal.md`, `design.md`, `tasks.md` y `specs/`.

### Implementar las tareas

```
/opsx:apply
```

El asistente irá ejecutando las tareas de `tasks.md`. Puedes invocar skills específicos en mitad del proceso, por ejemplo:

- "Usa el skill de `test-driven-development` para escribir las pruebas del contrato."
- "Aplica el skill `rust-audit` para revisar el código."

### Archivar un cambio completado

```
/opsx:archive
```

Mueve el cambio a `openspec/changes/archive/` y actualiza las especificaciones globales.

---

## 9. Comandos útiles para el día a día

| Acción | Comando |
| :--- | :--- |
| Listar todos los skills disponibles | `oah list` |
| Sincronizar skills con upstream | `cd ~/open-agent-hub && oah sync` |
| Habilitar solo skills para un asistente | `oah enable --target=cursor` |
| Deshabilitar todos los componentes | `oah disable` |
| Ver el estado de los enlaces | `oah status` |

---

## 10. Solución de problemas comunes

### ❌ Error `EPERM: operation not permitted` al ejecutar `oah enable`

- **Windows**: Ejecuta la terminal como **Administrador** o activa el **Modo Desarrollador**.
- **WSL**: Asegúrate de que la carpeta de destino esté en el sistema de archivos de Linux (ej. `~/proyecto`) y no en `/mnt/...` para evitar problemas de permisos cruzados.

### ❌ Los comandos `/opsx:*` no aparecen en el asistente

- Verifica que los archivos de comandos existen en `.claude/commands/` o `.cursor/commands/`.
- Reinicia el asistente o el IDE.
- En Cursor, asegúrate de que la carpeta `.cursor` esté en la raíz del proyecto.

### ❌ `oah` no se reconoce como comando

- Asegúrate de haber ejecutado `npm link` dentro de la carpeta `~/open-agent-hub`.
- En Windows, verifica que `%APPDATA%\npm` esté en tu PATH (o `~/.npm-global/bin`).

### ❌ No se ven los skills de `open-agent-hub` en el asistente

- Revisa que los enlaces simbólicos se hayan creado correctamente.
- En algunos asistentes (como Cursor), los skills se cargan al iniciar; reinicia el asistente.

---

## 11. Documentación de referencia

- [Design Guide](docs/DESIGN.md) – Guía de identidad visual y UI.
- [AGENTS.md](AGENTS.md) – Convenciones para asistentes de IA.
- [GEMINI.md](GEMINI.md) – Guía específica para Gemini.
- [OpenSpec Docs](https://github.com/Fission-AI/OpenSpec)
- [open-agent-hub](https://github.com/guanyang/open-agent-hub)

---

## 12. Contacto y soporte

Para dudas o problemas, crea un issue en el repositorio o contacta al equipo directamente.

¡Buena suerte y a construir OtterPot! 🦦
