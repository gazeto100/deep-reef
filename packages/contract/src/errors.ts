import type { Problem, ServerErrorCode } from './schemas';

/** Errors produced by the client side of a transport; a server never returns them. */
export const ClientErrorCodes = ['TIMEOUT', 'NETWORK_ERROR', 'ABORTED'] as const;
export type ClientErrorCode = (typeof ClientErrorCodes)[number];

export type ErrorCode = ServerErrorCode | ClientErrorCode;

interface ErrorInfo {
  /** HTTP status a server uses for this code (0 for client-side codes). */
  readonly status: number;
  readonly title: string;
  /**
   * Whether repeating the same request can succeed. Spins are idempotent by requestId,
   * so even a request that reached the server is safe to retry.
   */
  readonly retryable: boolean;
}

export const ERROR_INFO: Readonly<Record<ErrorCode, ErrorInfo>> = {
  VALIDATION_ERROR: { status: 400, title: 'Request validation failed', retryable: false },
  SESSION_NOT_FOUND: { status: 404, title: 'Session not found', retryable: false },
  IDEMPOTENCY_CONFLICT: {
    status: 409,
    title: 'requestId was already used with a different request',
    retryable: false,
  },
  INVALID_BET: { status: 422, title: 'Bet is not an allowed bet level', retryable: false },
  INSUFFICIENT_FUNDS: { status: 422, title: 'Balance is lower than the bet', retryable: false },
  RATE_LIMITED: { status: 429, title: 'Too many requests', retryable: true },
  INTERNAL_ERROR: { status: 500, title: 'Internal server error', retryable: true },
  SERVICE_UNAVAILABLE: { status: 503, title: 'Service temporarily unavailable', retryable: true },
  TIMEOUT: { status: 0, title: 'The server did not answer in time', retryable: true },
  NETWORK_ERROR: { status: 0, title: 'The server could not be reached', retryable: true },
  ABORTED: { status: 0, title: 'The request was cancelled by the caller', retryable: false },
};

/** Base URI for Problem `type` values. Each code has its own URI under it. */
export const PROBLEM_TYPE_BASE = 'https://github.com/gazeto100/deep-reef/blob/main/docs/api.md#';

/**
 * The single error type every GameServer implementation throws, whether it is the
 * in-browser mock, the HTTP client or the game service itself.
 */
export class GameServerError extends Error {
  override readonly name = 'GameServerError';
  readonly code: ErrorCode;
  readonly status: number;
  readonly retryable: boolean;
  readonly requestId: string | undefined;

  constructor(code: ErrorCode, detail?: string, options?: { requestId?: string; cause?: unknown }) {
    super(detail ?? ERROR_INFO[code].title, options?.cause === undefined ? undefined : { cause: options.cause });
    this.code = code;
    this.status = ERROR_INFO[code].status;
    this.retryable = ERROR_INFO[code].retryable;
    this.requestId = options?.requestId;
  }

  /** RFC 9457 body for server-side codes. */
  toProblem(): Problem {
    if (this.status === 0) throw new Error(`${this.code} is a client-side code and has no HTTP representation`);
    return {
      type: `${PROBLEM_TYPE_BASE}${this.code.toLowerCase()}`,
      title: ERROR_INFO[this.code].title,
      status: this.status,
      code: this.code as ServerErrorCode,
      detail: this.message,
      ...(this.requestId === undefined ? {} : { requestId: this.requestId }),
    };
  }

  static fromProblem(problem: Problem): GameServerError {
    return new GameServerError(
      problem.code,
      problem.detail,
      problem.requestId === undefined ? undefined : { requestId: problem.requestId },
    );
  }
}

export function isGameServerError(value: unknown): value is GameServerError {
  return value instanceof GameServerError;
}
