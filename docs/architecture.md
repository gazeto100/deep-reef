# Deep Reef: architecture

## Layers

```
src/
├─ math/        pure TypeScript: RNG, round engine, exact calculator, simulator, verify
├─ server/      mock game server (phase 3): wallet, async spin, latency, errors
├─ framework/   reusable slot client: Pixi host/rendering, state, audio (game-agnostic)
├─ games/       per-game configuration and composition (deep-reef)
├─ ui/          React UI (phase 4)
├─ App.tsx      composition root: wires the layers together
└─ main.tsx     entry point
```

## Allowed imports

| Layer                 | May import                                                    | Must not import                                                                    |
| --------------------- | ------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `math`                | nothing outside `src/math`                                    | React, Redux, GSAP, Pixi, Howler, `node:*`, any other layer, **not even as types** |
| `server`              | `math`                                                        | rendering/state libraries, `framework`, `games`, `ui`                              |
| `framework`           | `math` and `server` **types**; Pixi, React, GSAP…             | `games`, `ui`; math runtime (engine, RNG, analysis)                                |
| `games`               | `framework`; `math` types and config; `server` types          | `ui`; math runtime                                                                 |
| `ui`                  | `framework`, `games`; `math` types and config; `server` types | `pixi.js` directly; math runtime                                                   |
| `App.tsx`, `main.tsx` | everything                                                    | —                                                                                  |

These rules are enforced, not just documented:

- **ESLint** (`eslint.config.js`): `no-restricted-imports` with per-folder patterns covers
  both `@alias` and relative imports. "Types only" uses `allowTypeImports`, so
  `import type { RoundResult } from '@math/engine/types'` passes in the client, while
  `import { SlotEngine } ...` fails. Runtime engine code can only reach the client through
  the server, so the client can never compute an outcome itself.
- **TypeScript** (`tsconfig.math.json`): `src/math` compiles with `lib: ["ES2022"]` and
  `types: []`. `window`, `document` and `process` do not exist there, so math also runs
  unchanged in Node (simulator) and in a worker or server.

Path aliases (`@math/*`, `@framework/*`, `@games/*`, `@server/*`, `@ui/*`) are defined in
`tsconfig.base.json` and mirrored in `vite.config.ts`.

## TypeScript projects

| Config               | Covers                                     | Environment                           |
| -------------------- | ------------------------------------------ | ------------------------------------- |
| `tsconfig.app.json`  | `src/**`                                   | browser (DOM lib, Vite types)         |
| `tsconfig.math.json` | `src/math/**` minus tests                  | **no DOM, no Node**: the purity check |
| `tsconfig.node.json` | `scripts/**`, math tests, `vite.config.ts` | Node                                  |

`npm run typecheck` builds all three (`tsc -b`). TypeScript is pinned to 6.0 because
typed linting (typescript-eslint) does not support the TypeScript 7 native compiler yet.

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
