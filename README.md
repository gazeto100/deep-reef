# Deep Reef

[![CI](https://github.com/gazeto100/deep-reef/actions/workflows/ci.yml/badge.svg)](https://github.com/gazeto100/deep-reef/actions/workflows/ci.yml)

A 5x3, 20-line video slot with wild, scatter and free spins. It is a portfolio project built with TypeScript, PixiJS v8, React, Redux Toolkit and GSAP.

> Demo only. It uses virtual credits, not real money.

## Status

Work in progress. Each development phase lives on its own branch and is merged into `main` with `--no-ff`.

| Phase | Scope                                                                                               | State |
| ----- | --------------------------------------------------------------------------------------------------- | ----- |
| 0     | Repository setup                                                                                    | done  |
| 1     | Math engine, exact RTP calculator, simulator, verify                                                | done  |
| 2     | Vite + React, project structure and boundaries                                                      | done  |
| 3a    | npm workspaces, server contract + OpenAPI, game core (wallet, idempotency), mock + resilient client | done  |
| 4     | Playable version online: Redux, React controls, Pixi reels, cPanel build                            |       |
| 3b    | Fastify server, conformance tests, Docker, rate limiting, CORS                                      |       |
| 5     | Visuals: symbol atlas, loading screen, win presentation                                             |       |
| 6     | Sound (Howler.js) and GSAP animations                                                               |       |
| 7–8   | Test suite completion, final README                                                                 |       |

## Scripts

| Command               | What it does                                                         |
| --------------------- | -------------------------------------------------------------------- |
| `npm run dev`         | Vite dev server                                                      |
| `npm run build`       | Typecheck and production build                                       |
| `npm run typecheck`   | `tsc -b` over the browser, pure-math and Node projects               |
| `npm run lint`        | ESLint (including layer boundaries) and Prettier check               |
| `npm test`            | Vitest                                                               |
| `npm run math:verify` | Math invariants (reachability, contribution, pay order, RTP bounds…) |
| `npm run math:exact`  | Exact full-cycle math report                                         |
| `npm run math:sim`    | Monte Carlo simulation, compared with the exact values               |
| `npm run api:openapi` | Regenerate `packages/contract/openapi.yaml` from the schemas         |
| `npm run api:lint`    | Lint the OpenAPI spec (Redocly)                                      |

CI runs typecheck, lint, tests (a stale `openapi.yaml` fails a test), OpenAPI lint, verify and build on every push and pull request.

## Documentation

- [Architecture and layer boundaries](docs/architecture.md)
- [Game server API: idempotency, errors, concurrency](docs/api.md) · [OpenAPI spec](packages/contract/openapi.yaml)
- [Math tuning log](docs/math-tuning.md)
- [Exact math report](docs/math-report.md)
- [Simulation results](docs/math-simulation.md)
