# Deep Reef

A 5x3, 20-line video slot with wild, scatter and free spins. It is a portfolio project built with TypeScript, PixiJS v8, React, Redux Toolkit and GSAP.

> Demo only. It uses virtual credits, not real money.

## Status

Work in progress. Each development phase lives on its own branch and is merged into `main` with `--no-ff`.

| Phase | Scope                                                                |
| ----- | -------------------------------------------------------------------- |
| 0     | Repository setup                                                     |
| 1     | Math engine, exact RTP calculator, simulator, verify                 |
| 2     | Vite + React, project structure and boundaries                       |
| 3     | Mock game server (async, latency, errors, timeout)                   |
| 4     | Redux Toolkit state + React UI                                       |
| 5     | PixiJS rendering (reels, slam stop, turbo, win presentation, resize) |
| 6     | Sound (Howler.js) and GSAP animations                                |
| 7     | Vitest test suite                                                    |
| 8     | Build and deployment                                                 |

Architecture, math and simulator results will be documented here as the phases land.
