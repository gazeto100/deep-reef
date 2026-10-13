# Deep Reef: game server API

The contract between the client and any game server. The machine-readable source of truth is
[`packages/contract/openapi.yaml`](../packages/contract/openapi.yaml) (OpenAPI 3.1), generated
from the TypeBox schemas in `packages/contract/src/schemas.ts`. A server in another language
(for example Java) implements that file.

## Implementations

| Implementation                         | Where                         | Used for                                        |
| -------------------------------------- | ----------------------------- | ----------------------------------------------- |
| `GameService`                          | `packages/game-service`       | the game core; implements `GameServer` itself   |
| `MockGameServer` (+ in-memory storage) | `apps/web/src/transport/mock` | the static demo: the game core in the browser   |
| Fastify server                         | `packages/server` (phase 3b)  | the real backend over HTTP                      |
| `ResilientGameServer`                  | `apps/web/src/transport`      | decorator: timeouts and retries for any of them |

The client chooses with `VITE_GAME_SERVER=mock|http` (see `apps/web/.env.example`).

## Endpoints (v1)

| Method | Path                             | Body          | Success                     |
| ------ | -------------------------------- | ------------- | --------------------------- |
| POST   | `/v1/sessions`                   | —             | 201 `CreateSessionResponse` |
| GET    | `/v1/sessions/{sessionId}`       | —             | 200 `SessionResponse`       |
| POST   | `/v1/sessions/{sessionId}/spins` | `SpinRequest` | 200 `SpinResponse`          |
| GET    | `/health`                        | —             | 200 `{ "status": "ok" }`    |

- **Sessions** are anonymous demo sessions that start with **10,000 credits**. The `sessionId`
  is an unguessable UUID. Authentication is out of scope for the demo; a real deployment would
  bind sessions to an authenticated player.
- **Money** is always an integer number of credits.
- **Outcomes** are computed entirely on the server, free spins included. The client only
  displays `SpinResponse.round`. `balanceBefore` and `balanceAfter` let it show the bet as
  taken at once and add the win after the presentation.

## Idempotency

Every spin carries a client-generated `requestId` (UUID), unique per spin.

| Situation                                  | Result                                                         |
| ------------------------------------------ | -------------------------------------------------------------- |
| First request                              | Round played, balance updated, `replayed: false`               |
| Same `requestId`, same bet                 | **The stored response** with `replayed: true`; nothing charged |
| Same `requestId`, different bet            | `409 IDEMPOTENCY_CONFLICT`                                     |
| Same `requestId` arriving concurrently     | Serialised: one plays, the others get the replay               |
| Request rejected (e.g. insufficient funds) | Nothing stored; the same `requestId` may be retried            |

This makes retries safe. If the server committed a round but the response was lost, the
client retries with the same `requestId` and receives that round instead of paying twice.
The mock can inject exactly this failure (`lost-response`), and a test covers the full
path: mock, resilient client and game core.

Idempotency records are kept per session for the last 1,000 spins (in-memory store).
Clients retry for seconds, so the window is generous. A persistent store would use a time
window instead (e.g. 24 hours).

## Atomicity

The whole round is computed before the wallet changes, so a spin is **one** state change:
`balance = balance − bet + win`, recorded together with the spin. `GameService` runs it inside
`SessionStore.transaction()`: the bet check, the round and the commit happen with exclusive
access to the session, and the staged changes apply together or not at all.

## Concurrency and multiple instances

The in-memory store serialises transactions with a **per-session lock in process memory**
(`KeyedMutex`). That is correct for **one process only**: one browser tab running the
mock, or one Node process. With several server instances behind a load balancer, two
instances could each take "their" lock for the same session and both debit it.

How it is solved with several instances, in order of preference:

1. **Database transaction with a row lock.** `BEGIN; SELECT balance FROM sessions WHERE id = $1
FOR UPDATE; …; INSERT INTO spins …; UPDATE sessions SET balance = $2 …; COMMIT;`. The row
   lock serialises spins of one session across all instances. `SessionStore.transaction()`
   was designed to map onto exactly this.
2. **Unique index `(session_id, request_id)`** on the spins table, as the last line of
   defence for idempotency: even if two transactions raced, the second insert fails and its
   transaction rolls back, and the retry then reads the stored spin.
3. **Optimistic concurrency** as an alternative to row locks: a `version` column,
   `UPDATE … WHERE id = $1 AND version = $2`, and a retry on conflict. It works well when
   spins of the same session rarely collide (one player clicks one spin at a time).
4. A **distributed lock** (e.g. Redis) only if the storage cannot do 1–3. It adds a second
   system that must be correct, lock expiry included.

Sticky sessions (routing one session to one instance) reduce collisions but are **not**
a correctness guarantee: instances restart and rebalance.

## Client resilience

`ResilientGameServer` wraps any transport:

- per-attempt timeout (default 3 s, `VITE_SERVER_TIMEOUT_MS`);
- up to 3 attempts with 250 ms and 750 ms backoff, **with the same request**, so the same
  `requestId`;
- retries only `retryable` errors: `TIMEOUT`, `NETWORK_ERROR`, `INTERNAL_ERROR`,
  `SERVICE_UNAVAILABLE`, `RATE_LIMITED`. Business errors fail immediately;
- the caller's `AbortSignal` cancels at once, during an attempt or a backoff delay.

## Errors

Errors are [RFC 9457](https://www.rfc-editor.org/rfc/rfc9457) problem documents
(`application/problem+json`) with a stable `code`:

```json
{
  "type": "https://github.com/gazeto100/deep-reef/blob/main/docs/api.md#insufficient_funds",
  "title": "Balance is lower than the bet",
  "status": 422,
  "code": "INSUFFICIENT_FUNDS",
  "detail": "balance 10 is lower than bet 20",
  "requestId": "6f1c2a9e-3b4d-4e5f-8a7b-9c0d1e2f3a4b"
}
```

Clients branch on `code`, never on `title` or `detail`.

| Code                   | HTTP | Retryable | Meaning                                                                    |
| ---------------------- | ---- | --------- | -------------------------------------------------------------------------- |
| `VALIDATION_ERROR`     | 400  | no        | The request does not match the schema                                      |
| `SESSION_NOT_FOUND`    | 404  | no        | Unknown `sessionId`                                                        |
| `IDEMPOTENCY_CONFLICT` | 409  | no        | `requestId` reused with a different request                                |
| `INVALID_BET`          | 422  | no        | `bet` is not one of `GameConfig.betLevels`                                 |
| `INSUFFICIENT_FUNDS`   | 422  | no        | `bet` exceeds the balance                                                  |
| `RATE_LIMITED`         | 429  | yes       | Too many requests (phase 3b)                                               |
| `INTERNAL_ERROR`       | 500  | yes       | Unexpected server failure; nothing was committed or the replay recovers it |
| `SERVICE_UNAVAILABLE`  | 503  | yes       | Temporarily unavailable                                                    |
| `TIMEOUT`              | —    | yes       | Client-side: no answer within the timeout                                  |
| `NETWORK_ERROR`        | —    | yes       | Client-side: the server could not be reached                               |
| `ABORTED`              | —    | no        | Client-side: cancelled by the caller                                       |

Both 422 codes are business-rule rejections of a well-formed request. They share the status,
and `code` tells them apart.

### validation_error

The body or a path parameter does not match the schema (e.g. `requestId` is not a UUID, or
`bet` is not a positive integer). Fix the request; retrying the same request fails again.

### session_not_found

The session does not exist (or, with a persistent store, has expired). Create a new session.

### idempotency_conflict

The `requestId` was already used for a spin with a different bet. Each new spin needs a new
`requestId`; only a retry of the same spin may reuse one.

### invalid_bet

The bet is not one of `GameConfig.betLevels`.

### insufficient_funds

The bet is higher than the balance. Nothing was charged.

### rate_limited

Too many requests in a short time. Retry after a delay.

### internal_error

An unexpected server error. Retrying with the same `requestId` is safe.

### service_unavailable

The server is temporarily unable to handle requests. Retrying with the same `requestId` is safe.
