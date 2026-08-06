(file content omitted - already provided in attachment)

# Horizon — Setup Guide (Yarn + Turborepo + electron-vite)

This guide walks you through building the Horizon monorepo from an empty
folder to a running Electron shell, step by step, by hand. It follows
`architecture.md` exactly, with two deliberate substitutions:

1. That document specifies **pnpm** workspaces; this guide uses **Yarn
   (classic, v1)** workspaces instead, since that's what you asked for.
2. `apps/desktop` is scaffolded with **`create-electron-vite`** rather than
   hand-written by file — you get a Vite + Electron + React + TS project
   wired end to end in one command, and we fold Horizon's own dependencies
   and folder structure into it afterward.

Everything else — folder layout, package boundaries, invariants — matches
the source docs.

It also sets up a `context/` folder at the repo root that holds your two
source documents, so they travel with the codebase and stay easy to point
an AI coding assistant (or a new contributor) at.

Work through the sections in order. Each one ends in something that
actually runs, so you're never more than a step away from a checkpoint.

---

## 0. Before you start

**What you'll have at the end of this guide:**

- A Yarn + Turborepo monorepo matching the `apps/` + `packages/` layout in `architecture.md` §2
- A `context/` folder with your reference docs
- An Electron window that opens, with a typed IPC round-trip working end to end
- Empty-but-wired `db`, `shared-types`, `ui`, and `design-tokens` packages
- Lint, typecheck, test, and build all runnable via `turbo`

**Prerequisites:**

- Node.js 20 LTS or newer (`node -v`)
- Yarn 1.22.x (`npm install -g yarn`, then `yarn -v`)
- Git

**Why Yarn classic (v1) and not Berry:** `better-sqlite3` and Electron both
rely on native module rebuilding (node-gyp / `electron-rebuild`). Yarn
Berry's default PnP linker fights with that. Classic Yarn's plain
`node_modules` layout is the path of least resistance here — if you want
Berry later, set `nodeLinker: node-modules` in `.yarnrc.yml` and most of
this still applies. This holds regardless of which bundler builds
`apps/desktop` — electron-vite externalizes native deps instead of
bundling them (§5.3), but the compiled binary in `node_modules` still has
to exist and match Electron's ABI, which is what the Yarn-classic layout
makes straightforward.

**A note on versions:** `architecture.md` defers exact dependency versions
to a `libraries.md` that wasn't included in what you gave me. Every install
command below — including the `create-electron-vite` scaffold — installs
the latest compatible version at the time you run it — pin things down
once you have that file.

---

## 1. Repo skeleton

```bash
mkdir horizon && cd horizon
git init
yarn init -y
```

Edit the generated `package.json` to make it a private workspace root:

```json
// package.json
{
  "name": "horizon",
  "private": true,
  "version": "0.1.0",
  "packageManager": "yarn@1.22.22",
  "workspaces": ["apps/*", "packages/*"],
  "scripts": {
    "dev": "turbo run dev --filter=desktop",
    "build": "turbo run build",
    "lint": "turbo run lint",
    "test": "turbo run test",
    "typecheck": "turbo run typecheck"
  }
}
```

Because the workspace globs are only `apps/*` and `packages/*`, a
top-level `context/` folder (no `package.json` inside it) is automatically
excluded — Yarn and Turborepo will never try to treat it as a package.

Create `.gitignore`:

```gitignore
# .gitignore
node_modules/
dist/
out/
release/
.turbo/
*.log
.DS_Store
.env
*.db
```

---

## 2. Turborepo

```bash
yarn add turbo --dev -W
```

Create `turbo.json`:

```json
// turbo.json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["out/**"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    },
    "lint": {
      "outputs": []
    },
    "test": {
      "dependsOn": ["^build"],
      "outputs": []
    },
    "typecheck": {
      "outputs": []
    }
  }
}
```

`outputs` is set to `out/**` because that's electron-vite's default build
directory (§5) — if any other package in the monorepo later builds to
`dist/`, add `"dist/**"` alongside it.

> If you end up on Turborepo 1.x instead of 2.x, rename `"tasks"` to
> `"pipeline"` — that's the only difference that matters here.

Checkpoint: `yarn turbo run build` should succeed and print "No tasks
were executed" (nothing exists yet — that's expected).

---

## 3. The `context/` folder

This folder is documentation only — nothing in `apps/` or `packages/`
should ever import from it. Its job is to keep the "why" and the "contract"
next to the code.

```bash
mkdir context
```

Save your two source documents here:

- `context/architecture.md` — the tech stack, folder structure, data flow, schema, and invariants (the document this guide is built from)
- `context/project_overview.md` — the product spec: tabs, user flows, scope, BYOK model

Add one more file to orient anyone (human or AI) opening the repo cold:

```markdown
<!-- context/README.md -->

# Context

Read these before touching code, in this order:

1. `project_overview.md` — what Horizon is, who it's for, what's in and
   out of scope for this build.
2. `architecture.md` — the technical contract: tech stack, folder
   ownership, data flow per feature, DB schema, and §6 Invariants.

§6 of `architecture.md` is non-negotiable. If a change requires breaking
an invariant there, the change is wrong, not the invariant.

This folder is documentation only. Nothing under `apps/` or `packages/`
imports from it.
```

Your tree so far:

```
horizon/
├── context/
│   ├── README.md
│   ├── architecture.md
│   └── project_overview.md
├── package.json
├── turbo.json
└── .gitignore
```

---

## 4. Shared tooling packages

### 4.1 `packages/tsconfig`

```bash
mkdir -p packages/tsconfig
```

```json
// packages/tsconfig/package.json
{
  "name": "@horizon/tsconfig",
  "version": "0.0.0",
  "private": true,
  "files": ["base.json", "react-library.json"]
}
```

```json
// packages/tsconfig/base.json
{
  "$schema": "https://json.schemastore.org/tsconfig",
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "isolatedModules": true
  }
}
```

```json
// packages/tsconfig/react-library.json
{
  "extends": "./base.json",
  "compilerOptions": {
    "jsx": "react-jsx",
    "lib": ["ES2022", "DOM", "DOM.Iterable"]
  }
}
```

`forceConsistentCasingInFileNames` is already `true` here — that's the
setting that will catch an `import "./app"` vs. an actual `App.tsx` file
mismatch (see §5.7) as a build error instead of a silent local-only bug.

### 4.2 `packages/eslint-config`

```bash
mkdir -p packages/eslint-config
```

```json
// packages/eslint-config/package.json
{
  "name": "@horizon/eslint-config",
  "version": "0.0.0",
  "private": true,
  "main": "index.js",
  "dependencies": {
    "@typescript-eslint/eslint-plugin": "^8.0.0",
    "@typescript-eslint/parser": "^8.0.0",
    "eslint-config-prettier": "^9.1.0",
    "eslint-plugin-react-hooks": "^5.0.0"
  }
}
```

```js
// packages/eslint-config/index.js
module.exports = {
  root: true,
  parser: "@typescript-eslint/parser",
  plugins: ["@typescript-eslint", "react-hooks"],
  extends: [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended",
    "prettier",
  ],
  rules: {
    "react-hooks/rules-of-hooks": "error",
    "react-hooks/exhaustive-deps": "warn",
  },
};
```

### 4.3 `packages/design-tokens`

```bash
mkdir -p packages/design-tokens/src
```

```json
// packages/design-tokens/package.json
{
  "name": "@horizon/design-tokens",
  "version": "0.0.0",
  "private": true,
  "main": "src/index.ts",
  "files": ["src", "tailwind-preset.js"]
}
```

```css
/* packages/design-tokens/src/tokens.css */
/* Fill these in from the Purge-derived palette / type scale / radii. */
:root {
  --color-bg: #ffffff;
  --color-fg: #111111;
  --color-muted: #6b7280;
  --color-accent: #2563eb;
  --radius-sm: 4px;
  --radius-md: 8px;
  --radius-lg: 12px;
}
```

```js
// packages/design-tokens/tailwind-preset.js
/** @type {import('tailwindcss').Config} */
module.exports = {
  theme: {
    extend: {
      colors: {
        bg: "var(--color-bg)",
        fg: "var(--color-fg)",
        muted: "var(--color-muted)",
        accent: "var(--color-accent)",
      },
      borderRadius: {
        sm: "var(--radius-sm)",
        md: "var(--radius-md)",
        lg: "var(--radius-lg)",
      },
    },
  },
};
```

```ts
// packages/design-tokens/src/index.ts
// This package ships CSS custom properties + a Tailwind preset, not JS —
// there's nothing here to export from TypeScript. Import the stylesheet
// directly wherever it's needed instead, e.g.:
//   @import "@horizon/design-tokens/src/tokens.css";
export {};
```

> **Fix for "Cannot find module './tokens.css'":** the original draft of
> this file had `export * from "./tokens.css";`. TypeScript can't export
> members from a `.css` file, and this package's `tsconfig` extends the
> plain `base.json` (no DOM/Vite asset types), so that line was always
> going to fail a typecheck. The stylesheet is already wired up correctly
> elsewhere — via the `@import` in `apps/desktop/src/renderer/src/styles.css`
> (§5.7) — so `index.ts` doesn't need to touch it at all.

### 4.4 `packages/shared-types`

The single source of truth for every IPC contract (Invariant I-9).

```bash
mkdir -p packages/shared-types/src
```

```json
// packages/shared-types/package.json
{
  "name": "@horizon/shared-types",
  "version": "0.0.0",
  "private": true,
  "main": "src/index.ts",
  "dependencies": {
    "zod": "^3.23.0"
  }
}
```

```ts
// packages/shared-types/src/scan.ts
import { z } from "zod";

export const ScanStartRequest = z.object({
  scope: z.array(z.string()),
});
export type ScanStartRequest = z.infer<typeof ScanStartRequest>;

export const ScanProgressEvent = z.object({
  event: z.enum(["found", "complete"]),
  path: z.string().optional(),
  summary: z
    .object({ totalFiles: z.number(), totalBytes: z.number() })
    .optional(),
});
export type ScanProgressEvent = z.infer<typeof ScanProgressEvent>;
```

```ts
// packages/shared-types/src/index.ts
export * from "./scan";
```

Add one schema file per IPC channel family (`duplicates.ts`,
`forecast.ts`, `assistant.ts`, …) as you build each feature — see §11.

### 4.5 `packages/ui`

```bash
mkdir -p packages/ui/src
```

```json
// packages/ui/package.json
{
  "name": "@horizon/ui",
  "version": "0.0.0",
  "private": true,
  "main": "src/index.ts",
  "peerDependencies": {
    "react": "^19.0.0"
  },
  "dependencies": {
    "@horizon/design-tokens": "*"
  }
}
```

```tsx
// packages/ui/src/Button.tsx
import type { ButtonHTMLAttributes } from "react";

export function Button(props: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={`rounded-md bg-accent px-3 py-2 text-white ${props.className ?? ""}`}
    />
  );
}
```

```ts
// packages/ui/src/index.ts
export * from "./Button";
```

---

## 5. `apps/desktop` scaffold (via `create-electron-vite`)

### 5.1 Why electron-vite instead of hand-rolled tsup + Vite

`create vite@latest` only knows how to scaffold a frontend app — it has no
concept of Electron's main/preload processes, so it would only ever cover
the renderer half of what the original guide built by hand with `tsup`.
`electron-vite` (via its `create-electron-vite` scaffold) is built
specifically for Electron + Vite projects, and it buys you:

- **One config file** (`electron.vite.config.ts`) for main, preload, _and_
  renderer, instead of `tsup.config.ts` + `vite.config.ts`.
- **Built-in native-module handling** via `externalizeDepsPlugin()` —
  replaces the manual `external: [...]` list from the tsup config.
- **`electron-vite dev`** starts the renderer dev server, watches +
  rebuilds main/preload, and launches (and hot-reloads) Electron itself —
  no more hand-wiring `concurrently` + `wait-on` + `cross-env`.

### 5.2 Scaffold the app

```bash
cd apps
yarn create @quick-start/electron desktop --template react-ts
cd desktop
```

This drops a self-contained Vite + Electron + React + TS project at
`apps/desktop`, wired end to end (main/preload/renderer, HMR, an
electron-builder-ready structure). The rest of this section folds it into
the Yarn workspace and layers Horizon's own dependencies and folders on
top. Roughly what you get out of the box:

```
apps/desktop/
├── src/
│   ├── main/index.ts
│   ├── preload/index.ts
│   └── renderer/
│       ├── index.html
│       └── src/{App.tsx, main.tsx, assets/}
├── electron.vite.config.ts
├── electron-builder.yml
├── package.json
├── tsconfig.json
├── tsconfig.node.json
└── tsconfig.web.json
```

### 5.3 Fold it into the Yarn workspace

Replace the generated `package.json` with Horizon's actual dependency
list, hooked into the workspace packages:

```json
// apps/desktop/package.json
{
  "name": "desktop",
  "version": "0.1.0",
  "private": true,
  "main": "./out/main/index.js",
  "scripts": {
    "dev": "electron-vite dev",
    "build": "electron-vite build && electron-builder",
    "typecheck": "tsc --noEmit -p tsconfig.node.json && tsc --noEmit -p tsconfig.web.json",
    "lint": "eslint src",
    "test": "vitest run",
    "postinstall": "electron-builder install-app-deps"
  },
  "dependencies": {
    "@horizon/design-tokens": "*",
    "@horizon/shared-types": "*",
    "@horizon/ui": "*",
    "@anthropic-ai/sdk": "^0.30.0",
    "@radix-ui/react-dialog": "^1.1.0",
    "@radix-ui/react-tabs": "^1.1.0",
    "@tanstack/react-query": "^5.0.0",
    "better-sqlite3": "^11.0.0",
    "blockhash-core": "^0.1.0",
    "drizzle-orm": "^0.33.0",
    "groq-sdk": "^0.7.0",
    "lucide-react": "^0.400.0",
    "node-cron": "^3.0.0",
    "ollama": "^0.5.0",
    "openai": "^4.0.0",
    "piscina": "^4.0.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "recharts": "^2.12.0",
    "sharp": "^0.33.0",
    "simple-icons": "^13.0.0",
    "simple-statistics": "^7.8.0",
    "trash": "^8.1.0",
    "zod": "^3.23.0"
  },
  "devDependencies": {
    "@horizon/eslint-config": "*",
    "@horizon/tsconfig": "*",
    "@testing-library/react": "^16.0.0",
    "@types/better-sqlite3": "^7.6.0",
    "@types/node": "^20.0.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "@vitejs/plugin-react": "^4.3.0",
    "autoprefixer": "^10.4.0",
    "drizzle-kit": "^0.24.0",
    "electron": "^31.0.0",
    "electron-builder": "^24.13.0",
    "electron-vite": "^2.3.0",
    "postcss": "^8.4.0",
    "tailwindcss": "^3.4.0",
    "typescript": "^5.5.0",
    "vite": "^5.4.0",
    "vitest": "^2.0.0"
  }
}
```

Compared to the tsup version, `concurrently`, `cross-env`, `tsup`, and
`wait-on` are gone — `electron-vite dev` replaces all four. The new
`postinstall` line is the native-module rebuild step mentioned in §0:
`better-sqlite3` and `sharp` need to be compiled against Electron's Node
ABI, and `externalizeDepsPlugin()` (next) only stops them from being
_bundled_ — it doesn't rebuild them.

Run the install from the repo root so Yarn wires up the workspace symlinks:

```bash
cd ../.. # back to repo root
yarn install
```

### 5.4 `electron.vite.config.ts`

Replace the generated one with:

```ts
// apps/desktop/electron.vite.config.ts
import { resolve } from "node:path";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
  },
  renderer: {
    root: "src/renderer",
    resolve: {
      alias: {
        "@renderer": resolve("src/renderer/src"),
      },
    },
    plugins: [react()],
  },
});
```

### 5.5 tsconfig split (Node vs. web)

electron-vite's convention is two tsconfigs — Node types for main/preload,
DOM + Vite types for the renderer — tied together by a root config using
project references:

```json
// apps/desktop/tsconfig.node.json
{
  "extends": "@horizon/tsconfig/base.json",
  "compilerOptions": {
    "composite": true,
    "outDir": "dist-ts/node",
    "types": ["node", "electron-vite/node"]
  },
  "include": ["src/main", "src/preload", "electron.vite.config.ts"]
}
```

```json
// apps/desktop/tsconfig.web.json
{
  "extends": "@horizon/tsconfig/react-library.json",
  "compilerOptions": {
    "composite": true,
    "outDir": "dist-ts/web",
    "baseUrl": ".",
    "paths": { "@renderer/*": ["src/renderer/src/*"] },
    "types": ["vite/client"]
  },
  "include": ["src/renderer/src"]
}
```

```json
// apps/desktop/tsconfig.json
{
  "files": [],
  "references": [
    { "path": "./tsconfig.node.json" },
    { "path": "./tsconfig.web.json" }
  ]
}
```

### 5.6 Main process

```ts
// apps/desktop/src/main/index.ts
import { app, BrowserWindow, ipcMain } from "electron";
import path from "node:path";

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // electron-vite sets this automatically while `electron-vite dev` is running
  if (process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    win.loadFile(path.join(__dirname, "../renderer/index.html"));
  }
}

// Temporary checkpoint handler — replace with real ipc/ modules per feature (§11)
ipcMain.handle("app:ping", () => "pong");

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
```

`ELECTRON_RENDERER_URL` replaces the old manual `NODE_ENV === "development"`
check — it's electron-vite's own signal that the dev server is live, so
`cross-env` is no longer needed to set that flag by hand.

### 5.7 Preload — the narrow bridge

```ts
// apps/desktop/src/preload/index.ts
import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("horizon", {
  ping: () => ipcRenderer.invoke("app:ping"),
});
```

### 5.8 Renderer

electron-vite's React template nests renderer source under
`src/renderer/src`, with a **default-exported, capital-`App`** component.
Keep that convention — it's what avoids the second error you hit:

> **Fix for "Cannot find module './app'":** that error means the import
> path and the actual file didn't agree — either on name/casing
> (`./app` vs. `App.tsx`) or on export style (`{ App }` named vs. `App`
> default). It'll surface even if it "worked" locally on a case-insensitive
> filesystem (Mac/Windows), because CI and Linux are case-sensitive. Pick
> one convention and match it on both sides — below, that's capital
> `App.tsx` with a default export, imported as `import App from "./App"`.

```html
<!-- apps/desktop/src/renderer/index.html -->
<!doctype html>
<html>
  <head>
    <meta charset="UTF-8" />
    <title>Horizon</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

```tsx
// apps/desktop/src/renderer/src/main.tsx
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";

createRoot(document.getElementById("root")!).render(<App />);
```

```tsx
// apps/desktop/src/renderer/src/App.tsx
import { useEffect, useState } from "react";
import { Button } from "@horizon/ui";

export default function App() {
  const [pong, setPong] = useState<string>("…");

  useEffect(() => {
    window.horizon.ping().then(setPong);
  }, []);

  return (
    <div className="p-8">
      <h1 className="text-xl font-semibold">Horizon</h1>
      <p className="text-muted">IPC checkpoint: {pong}</p>
      <Button onClick={() => window.horizon.ping().then(setPong)}>
        Ping main process
      </Button>
    </div>
  );
}
```

```css
/* apps/desktop/src/renderer/src/styles.css */
@tailwind base;
@tailwind components;
@tailwind utilities;
@import "@horizon/design-tokens/src/tokens.css";
```

```ts
// apps/desktop/src/renderer/src/global.d.ts
export {};
declare global {
  interface Window {
    horizon: {
      ping: () => Promise<string>;
    };
  }
}
```

### 5.9 Tailwind

Only the content globs change (source now lives under `src/renderer/src`):

```js
// apps/desktop/tailwind.config.js
const preset = require("@horizon/design-tokens/tailwind-preset");

/** @type {import('tailwindcss').Config} */
module.exports = {
  presets: [preset],
  content: [
    "./src/renderer/src/**/*.{ts,tsx}",
    "../../packages/ui/src/**/*.{ts,tsx}",
  ],
};
```

```js
// apps/desktop/postcss.config.js
module.exports = { plugins: { tailwindcss: {}, autoprefixer: {} } };
```

### 5.10 electron-builder

Only the output directory changes — electron-vite writes to `out/`, not
`dist/`:

```yaml
# apps/desktop/electron-builder.yml
appId: com.horizon.app
productName: Horizon
directories:
  output: release
files:
  - out/**
mac:
  category: public.app-category.utilities
win:
  target: nsis
linux:
  target: AppImage
```

**Checkpoint:**

```bash
yarn dev
```

An Electron window should open showing "IPC checkpoint: pong". That's the
whole renderer → preload → main → back loop working, typed end to end —
same result as the tsup version, fewer moving parts to get there.

---

## 6. Database layer (Drizzle + better-sqlite3)

```ts
// apps/desktop/src/main/db/schema.ts
import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";

export const scanRuns = sqliteTable("scan_runs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  startedAt: text("started_at").notNull(),
  completedAt: text("completed_at"),
  scopePaths: text("scope_paths").notNull(),
  status: text("status", {
    enum: ["running", "complete", "cancelled", "failed"],
  }).notNull(),
  totalFiles: integer("total_files").default(0),
  totalBytes: integer("total_bytes").default(0),
});

// Add the remaining tables (file_index, duplicate_groups,
// duplicate_group_members, usage_snapshots, forecasts, recommendations,
// cleanup_actions, archives, settings, ai_provider_config) from
// context/architecture.md §5 as you build each feature.
```

```ts
// apps/desktop/src/main/db/client.ts
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import path from "node:path";
import { app } from "electron";
import * as schema from "./schema";

const dbPath = path.join(app.getPath("userData"), "horizon.db");
const sqlite = new Database(dbPath);
export const db = drizzle(sqlite, { schema });
```

```ts
// apps/desktop/drizzle.config.ts
import type { Config } from "drizzle-kit";

export default {
  schema: "./src/main/db/schema.ts",
  out: "./src/main/db/migrations",
  dialect: "sqlite",
} satisfies Config;
```

Add scripts to `apps/desktop/package.json`:

```json
"db:generate": "drizzle-kit generate",
"db:migrate": "drizzle-kit migrate"
```

```bash
cd apps/desktop
yarn db:generate
```

This should produce your first migration file under
`src/main/db/migrations/`. Wire migration-on-startup into `main/index.ts`
before you rely on the DB in a real feature (Invariant I-11).

---

## 7. Verify the whole pipeline

From the repo root:

```bash
yarn typecheck
yarn lint
yarn test
yarn build
```

Each should run across every workspace package via Turborepo's task
graph. `yarn build` is the slow one first time through (it invokes
`electron-vite build` then `electron-builder`) — that's expected.

---

## 8. Environment & secrets

```bash
# .env.example
NODE_ENV=development
```

Real secrets (AI provider API keys) never go in `.env` or the SQLite DB —
they go through `secure-storage.ts` wrapping Electron's `safeStorage`
(Invariant I-5). Stub it now so the boundary exists before any feature
needs it:

```ts
// apps/desktop/src/main/core/secure-storage.ts
import { safeStorage } from "electron";
import fs from "node:fs";
import path from "node:path";
import { app } from "electron";

const secretsPath = () => path.join(app.getPath("userData"), "secrets.enc");

export function saveSecret(value: string) {
  const encrypted = safeStorage.encryptString(value);
  fs.writeFileSync(secretsPath(), encrypted);
}

export function readSecret(): string | null {
  if (!fs.existsSync(secretsPath())) return null;
  const encrypted = fs.readFileSync(secretsPath());
  return safeStorage.decryptString(encrypted);
}
```

No other module should ever touch this file or return a raw key across
IPC (I-5).

---

## 9. Commit the boilerplate

```bash
cd ../..   # repo root
git add .
git commit -m "chore: Horizon monorepo boilerplate (yarn + turborepo + electron-vite)"
```

Your tree now matches `architecture.md` §2, minus the feature-specific
files you'll add next.

---

## 10. Where to start "real" coding

Build in this order — it follows the data-flow dependencies in
`context/architecture.md` §4, so nothing you build is blocked on
something you haven't built yet. Before each step, skim §6 (Invariants)
in that file for the ones relevant to what you're about to touch.

| Step | What                                                                                                                      | Architecture ref          |
| ---- | ------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| 1    | Finish `db/schema.ts` (all tables) + generate the migration                                                               | §5                        |
| 2    | `main/services/scanner.ts` + `main/workers/scan.worker.ts` + `main/ipc/scan.ts`, wired to a real "Run Scan" button        | §4.2                      |
| 3    | `hashing.ts` (exact + perceptual) → `duplicate_groups`                                                                    | §4.3                      |
| 4    | `staleness.ts` (unused files) and the large-files query                                                                   | §4.4, §4.5                |
| 5    | `scheduler.ts` (node-cron) + `forecasting.ts`                                                                             | §4.6                      |
| 6    | `llm-client.ts` provider wrapper + `recommendations`                                                                      | §4.7                      |
| 7    | `assistant.ts` chat IPC + streaming                                                                                       | §4.8                      |
| 8    | `archiver.ts` (compress → verify → remove)                                                                                | §4.10                     |
| 9    | `deletion-policy.ts` + `trash.ts`, wired to the Duplicates/Unused/Large Files "Trash" actions, re-validated in main (I-2) | §4.9                      |
| 10   | `ai-provider:configure` settings flow using `secure-storage.ts`                                                           | §4.11                     |
| 11   | Onboarding wizard (permissions, scan scope, AI provider)                                                                  | §4.1                      |
| 12   | Tray "Horizon Mini" popover                                                                                               | project_overview.md §5.12 |

For each step: add the zod schema to `packages/shared-types` first, then
the service in `main/services/`, then the thin `main/ipc/` handler, then
the renderer tab that calls it. That order keeps the IPC contract as the
thing you design first, not an afterthought — which is the whole point of
`packages/shared-types` owning it exclusively (I-9).
