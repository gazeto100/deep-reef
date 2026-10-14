# Deep Reef

[![CI](https://github.com/gazeto100/deep-reef/actions/workflows/ci.yml/badge.svg)](https://github.com/gazeto100/deep-reef/actions/workflows/ci.yml)

A 5x3, 20-line video slot with wild, scatter and free spins. It is a portfolio project built with TypeScript, PixiJS v8, React, Redux Toolkit and GSAP.

> **Demo only. It uses virtual credits, not real money.**
>
> **Play it: [deepreef.marketpage.bg](https://deepreef.marketpage.bg/)** · with network faults: [?faults=1](https://deepreef.marketpage.bg/?faults=1)

## Playing the demo

The public build runs entirely in the browser. The game core (the same `GameService` a real
server will run) sits behind a simulated network, so the client uses the same code paths it
would against a remote server.

| Action                | How                                                                                    |
| --------------------- | -------------------------------------------------------------------------------------- |
| Spin                  | **Spin** button or the space bar                                                       |
| Slam stop / skip wins | Press again while a round is running: first the reels stop, then the wins are skipped  |
| Turbo                 | **Turbo** toggle: shorter spins and win displays                                       |
| Change the bet        | **−** / **+** between rounds                                                           |
| Start over            | **Reset balance**: a new session with 10,000 credits                                   |
| Rules and pays        | **i** button: pays at the current bet, wild/scatter/free-spin rules, the 20 lines, RTP |

- The bet leaves the balance the moment you spin; the win is added after the presentation.
- The balance is kept in the browser's `localStorage`, so it survives a reload. Every round's
  outcome is decided by the game core before anything moves on screen.
- If you switch tabs mid-round, the round finishes immediately and the win is credited.

### Network fault mode: `?faults=1`

By default the public build simulates a healthy network (150–400 ms latency, no failures).
Add **`?faults=1`** to the address to turn on a "flaky network":

- 5% of requests fail before reaching the server;
- 3% fail with a server error before anything is committed;
- 5% **lose the response** after the server has committed the round.

A red **"Тестов режим: симулирани мрежови грешки"** badge appears in the header while the
mode is on, and the status line shows "Връзката се възстановява… (опит N)" during
retries. The client retries with the **same `requestId`**, so a lost response returns the
already played round instead of charging twice: the balance always matches the server's.
Remove the parameter (or use `?faults=0`) to turn it off. The mode only exists for the
in-browser mock; it has no effect on a real server.

## Status

Work in progress. Each development phase lives on its own branch and is merged into `main` with `--no-ff`.

| Phase | Scope                                                                                               | State |
| ----- | --------------------------------------------------------------------------------------------------- | ----- |
| 0     | Repository setup                                                                                    | done  |
| 1     | Math engine, exact RTP calculator, simulator, verify                                                | done  |
| 2     | Vite + React, project structure and boundaries                                                      | done  |
| 3a    | npm workspaces, server contract + OpenAPI, game core (wallet, idempotency), mock + resilient client | done  |
| 4     | Playable version online: Redux, React controls, Pixi reels, cPanel build                            | done  |
| 3b    | Fastify server, conformance tests, Docker, rate limiting, CORS                                      |       |
| 5     | Visuals: symbol atlas, loading screen, win presentation                                             |       |
| 6     | Sound (Howler.js) and GSAP animations                                                               |       |
| 7–8   | Test suite completion, final README                                                                 |       |

## Scripts

| Command               | What it does                                                             |
| --------------------- | ------------------------------------------------------------------------ |
| `npm run dev`         | Vite dev server                                                          |
| `npm run build`       | Typecheck and production build (`apps/web/dist`)                         |
| `npm run typecheck`   | `tsc -b` over the browser, pure-math and Node projects                   |
| `npm run lint`        | ESLint (including layer boundaries) and Prettier check                   |
| `npm test`            | Vitest                                                                   |
| `npm run math:verify` | Math invariants (reachability, contribution, pay order, RTP bounds…)     |
| `npm run math:exact`  | Exact full-cycle math report                                             |
| `npm run math:sim`    | Monte Carlo simulation, compared with the exact values                   |
| `npm run api:openapi` | Regenerate `packages/contract/openapi.yaml` from the schemas             |
| `npm run api:lint`    | Lint the OpenAPI spec (Redocly)                                          |
| `npm run package:web` | Build and pack `release/deep-reef-web-<commit>.zip` for cPanel (755/644) |

CI runs typecheck, lint, tests (a stale `openapi.yaml` fails a test), OpenAPI lint, verify and build on every push and pull request.

Client settings are environment variables (see `apps/web/.env.example`): `VITE_GAME_SERVER`
(`mock` or `http`), `VITE_MOCK_FAULTS`, `VITE_SERVER_TIMEOUT_MS`.

## Documentation

- [Architecture and layer boundaries](docs/architecture.md)
- [Game server API: idempotency, errors, concurrency](docs/api.md) · [OpenAPI spec](packages/contract/openapi.yaml)
- [Deploying the static demo to cPanel](docs/deploy-cpanel.md)
- [Math tuning log](docs/math-tuning.md)
- [Exact math report](docs/math-report.md)
- [Simulation results](docs/math-simulation.md)
