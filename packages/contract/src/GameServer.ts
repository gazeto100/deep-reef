import type { Session, SpinRequest, SpinResponse } from './schemas';

/**
 * The structural subset of AbortSignal this contract relies on. The contract package
 * has no DOM or Node typings, and a real AbortSignal from either runtime is assignable.
 */
export interface AbortSignalLike {
  readonly aborted: boolean;
  readonly reason?: unknown;
  addEventListener(type: 'abort', listener: () => void, options?: { once?: boolean }): void;
  removeEventListener(type: 'abort', listener: () => void): void;
}

export interface RequestOptions {
  readonly signal?: AbortSignalLike;
}

/**
 * The game server as the client sees it. Implementations: the in-browser mock, the HTTP
 * client for the Node server (phase 3b), and later any server that implements
 * openapi.yaml. Every method rejects with GameServerError.
 */
export interface GameServer {
  /** POST /v1/sessions: a new anonymous demo session with the starting balance. */
  createSession(options?: RequestOptions): Promise<Session>;
  /** GET /v1/sessions/{sessionId} */
  getSession(sessionId: string, options?: RequestOptions): Promise<Session>;
  /** POST /v1/sessions/{sessionId}/spins: idempotent by request.requestId. */
  spin(sessionId: string, request: SpinRequest, options?: RequestOptions): Promise<SpinResponse>;
}
