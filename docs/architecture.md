# Deep Reef: architecture

## Workspaces

The repository is an npm workspaces monorepo:

```
deep-reef/
├─ packages/
│  ├─ math/          @deep-reef/math          pure TypeScript: RNG, round engine, exact calculator,
│  │                                           simulator, verify (+ CLI scripts)
│  ├─ contract/      @deep-reef/contract      wire contract: schemas, types, error codes, OpenAPI  (phase 3a)
│  └─ game-service/  @deep-reef/game-service  game core: sessions, wallet, idempotent spins       (phase 3a)
└─ apps/
   └─ web/           @deep-reef/web           Vite + React + Pixi client
      └─ src/
         ├─ framework/  reusable slot client: Pixi host/rendering, state, audio (game-agnostic)
         ├─ games/      per-game configuration and composition (deep-reef)
         ├─ ui/         React UI (phase 4)
         ├─ transport/  GameServer implementations: mock, HTTP, resilient wrapper (phase 3a)
         ├─ App.tsx     composition root: wires the layers together
         └─ main.tsx    entry point
```

A Fastify server (`packages/server`) is planned for phase 3b. A server written in another
language can implement the same OpenAPI contract.

Workspace packages are **internal packages without a build step**. Their `exports` point
straight at the `.ts` sources (`"./*": "./src/*.ts"`), and Vite, Vitest and tsx compile them
on the fly. So `import { SlotEngine } from '@deep-reef/math/engine/SlotEngine'` works
everywhere with no stale `dist` folder.

## Allowed imports

| Workspace / layer             | May import                                            | Must not import                                                       |
| ----------------------------- | ----------------------------------------------------- | --------------------------------------------------------------------- |
| `packages/math`               | nothing                                               | React, Redux, GSAP, Pixi, Howler, `node:*`, any workspace, even types |
| `packages/contract`           | its schema library                                    | any workspace (not even math): the contract is language-neutral       |
| `packages/game-service`       | `math`, `contract`                                    | rendering/state libraries, `node:*`, other workspaces                 |
| `web/src/framework`           | `contract`; `math` types                              | `games`, `ui`, `transport`, `game-service`, math runtime              |
| `web/src/games`               | `framework`, `contract`; `math` types and config      | `ui`, `transport`, `game-service`, math runtime                       |
| `web/src/ui`                  | `framework`, `games`, `contract`; `math` types/config | `pixi.js` directly, `transport`, `game-service`, math runtime         |
| `web/src/transport`           | `contract`, `game-service`, `math`                    | rendering/state libraries, `framework`, `games`, `ui`                 |
| `web/src/App.tsx`, `main.tsx` | everything                                            | —                                                                     |

The math runtime is `@deep-reef/math/engine/*`, `rng/*` and `analysis/*`. Outside
`transport`, the client cannot compute an outcome: it only shows what a `GameServer`
returns. `transport` is the one place where the in-browser mock runs the game core.

These rules are enforced, not just documented:

- **ESLint** (`eslint.config.js`):
  - `no-restricted-imports` with per-folder patterns. "Types only" uses `allowTypeImports`.
  - `import-x/no-extraneous-dependencies`: every workspace must declare what it imports.
    npm hoists all packages into the root `node_modules`, so without this rule a workspace
    could silently use an undeclared dependency.
  - `import-x/no-relative-packages`: workspaces import each other by package name, never
    through `../../other-package`.
- **TypeScript** (`packages/math/tsconfig.src.json`): the math sources compile with
  `lib: ["ES2022"]` and `types: []`. `window`, `document` and `process` do not exist
  there, so math runs unchanged in Node (simulator), in the browser (mock) and on a server.

## TypeScript projects

`npm run typecheck` (`tsc -b`) builds every project through the solution files:

| Config                             | Covers                  | Environment                           |
| ---------------------------------- | ----------------------- | ------------------------------------- |
| `packages/math/tsconfig.src.json`  | math sources            | **no DOM, no Node**: the purity check |
| `packages/math/tsconfig.node.json` | math scripts and tests  | Node                                  |
| `apps/web/tsconfig.app.json`       | web sources             | browser (DOM lib, Vite types)         |
| `apps/web/tsconfig.node.json`      | `vite.config.ts`        | Node                                  |
| `tsconfig.node.json`               | root `vitest.config.ts` | Node                                  |

TypeScript is pinned to 6.0 because typed linting (typescript-eslint) does not support the
TypeScript 7 native compiler yet.

Tests run from the root with one `vitest run`. `vitest.config.ts` lists each workspace as
a Vitest project, and the web project reuses its `vite.config.ts`, aliases included.

## React and Pixi

React owns the DOM container; Pixi owns everything inside it.

- `framework/pixi/PixiHost.ts` manages one Pixi `Application` for one mount. Pixi v8
  initialises asynchronously, so if the host is disposed while `init()` is pending, the
  app is destroyed as soon as init resolves and its canvas is never attached. This is
  what makes React StrictMode's mount → unmount → mount safe.
- `framework/react/PixiCanvas.tsx` is the React boundary. It creates a fresh `PixiHost`
  per mount and uses `useEffectEvent` so callback props never re-create the app.

In development the shell's lifecycle log reads `init → init → aborted → mounted`: the
first StrictMode mount is aborted cleanly and only one canvas ever reaches the DOM.
