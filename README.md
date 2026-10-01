# Deep Reef

[![CI](https://github.com/gazeto100/deep-reef/actions/workflows/ci.yml/badge.svg)](https://github.com/gazeto100/deep-reef/actions/workflows/ci.yml)

A 5x3, 20-line video slot with wild, scatter and free spins. It is a portfolio project built with TypeScript, PixiJS v8, React, Redux Toolkit and GSAP.

> Demo only. It uses virtual credits, not real money.

## Status

Work in progress. Each development phase lives on its own branch and is merged into `main` with `--no-ff`.

| Phase | Scope                                                                | State |
| ----- | -------------------------------------------------------------------- | ----- |
| 0     | Repository setup                                                     | done  |
| 1     | Math engine, exact RTP calculator, simulator, verify                 | done  |
| 2     | Vite + React, project structure and boundaries                       | done  |
| 3     | Mock game server (async, latency, errors, timeout)                   |       |
| 4     | Redux Toolkit state + React UI                                       |       |
| 5     | PixiJS rendering (reels, slam stop, turbo, win presentation, resize) |       |
| 6     | Sound (Howler.js) and GSAP animations                                |       |
| 7     | Vitest test suite                                                    |       |
| 8     | Build and deployment                                                 |       |

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

CI runs typecheck, lint, tests, verify and build on every push and pull request.

## Documentation

- [Architecture and layer boundaries](docs/architecture.md)
- [Math tuning log](docs/math-tuning.md)
- [Exact math report](docs/math-report.md)
- [Simulation results](docs/math-simulation.md)
