import Type, { type Static, type TSchema } from 'typebox';

/**
 * Wire contract of the Deep Reef game server, version 1.
 *
 * Each schema is the single source for three things: the TypeScript types (Static<>),
 * runtime validation (TypeBox Value, or Fastify/Ajv on the server) and the OpenAPI
 * document (scripts/build-openapi.ts). A server in another language implements
 * openapi.yaml.
 *
 * Conventions:
 * - Money is an integer number of credits (never floating point).
 * - Shapes are closed (additionalProperties: false), so drift between client and server
 *   is caught instead of silently ignored.
 * - Every named schema has a `title`; the OpenAPI builder turns titled sub-schemas into
 *   $ref components.
 * - Positions are objects, not [reel, row] tuples: tuples differ between JSON Schema
 *   drafts and generate poorly in other languages.
 */

const closed = { additionalProperties: false } as const;

export const Uuid = Type.String({ format: 'uuid', description: 'RFC 4122 UUID.' });

export const Credits = Type.Integer({ minimum: 0, description: 'Amount in credits (integer).' });

export const SymbolId = Type.String({ minLength: 1, description: 'Symbol identifier, e.g. "SHARK".' });

export const Position = Type.Object(
  {
    reel: Type.Integer({ minimum: 0, description: '0-based reel (column).' }),
    row: Type.Integer({ minimum: 0, description: '0-based row, top = 0.' }),
  },
  { ...closed, title: 'Position' },
);

// ---------------------------------------------------------------- game config

export const PayEntry = Type.Object(
  {
    count: Type.Integer({ minimum: 1 }),
    multiplier: Type.Integer({ minimum: 0 }),
  },
  { ...closed, title: 'PayEntry' },
);

export const SymbolPays = Type.Object(
  {
    symbol: SymbolId,
    pays: Type.Array(PayEntry, { description: 'Multiples of the line bet.' }),
  },
  { ...closed, title: 'SymbolPays' },
);

export const GameConfig = Type.Object(
  {
    gameId: Type.String(),
    reels: Type.Integer({ minimum: 1 }),
    rows: Type.Integer({ minimum: 1 }),
    symbols: Type.Array(SymbolId),
    wild: SymbolId,
    scatter: SymbolId,
    paylines: Type.Array(Type.Array(Type.Integer({ minimum: 0 })), {
      description: 'Row index per reel for each payline.',
    }),
    betLevels: Type.Array(Credits, { minItems: 1, description: 'Allowed total bets.' }),
    linePays: Type.Array(SymbolPays),
    scatterPays: Type.Array(PayEntry, { description: 'Multiples of the total bet.' }),
    freeSpins: Type.Object(
      {
        triggerCount: Type.Integer({ minimum: 1 }),
        awarded: Type.Integer({ minimum: 1 }),
        winMultiplier: Type.Integer({ minimum: 1 }),
      },
      closed,
    ),
    maxWinMultiplier: Type.Integer({ minimum: 1, description: 'Round win cap as a multiple of total bet.' }),
  },
  { ...closed, title: 'GameConfig' },
);

// ---------------------------------------------------------------- sessions

/**
 * A session as every endpoint returns it. The config is included each time, so a client
 * that resumes a stored sessionId (GET) has everything it needs, as after a create.
 */
export const Session = Type.Object(
  {
    sessionId: Uuid,
    balance: Credits,
    config: GameConfig,
  },
  { ...closed, title: 'Session' },
);

// ---------------------------------------------------------------- spins

export const SpinRequest = Type.Object(
  {
    requestId: Type.String({
      format: 'uuid',
      description:
        'Idempotency key chosen by the client, unique per spin. Retrying with the same key returns the original result and never charges twice.',
    }),
    bet: Type.Integer({ minimum: 1, description: 'Total bet in credits; must be one of GameConfig.betLevels.' }),
  },
  { ...closed, title: 'SpinRequest' },
);

export const LineWin = Type.Object(
  {
    line: Type.Integer({ minimum: 0, description: '0-based payline index.' }),
    symbol: SymbolId,
    count: Type.Integer({ minimum: 1 }),
    positions: Type.Array(Position),
    win: Credits,
  },
  { ...closed, title: 'LineWin' },
);

export const ScatterWin = Type.Object(
  {
    count: Type.Integer({ minimum: 1 }),
    positions: Type.Array(Position),
    win: Credits,
    freeSpinsAwarded: Type.Integer({ minimum: 0 }),
  },
  { ...closed, title: 'ScatterWin' },
);

export const SpinOutcome = Type.Object(
  {
    stops: Type.Array(Type.Integer({ minimum: 0 }), { description: 'Top visible strip index per reel.' }),
    grid: Type.Array(Type.Array(SymbolId), { description: 'Visible symbols, grid[reel][row].' }),
    lineWins: Type.Array(LineWin),
    scatter: Type.Union([ScatterWin, Type.Null()]),
    multiplier: Type.Integer({ minimum: 1 }),
    win: Credits,
    capped: Type.Boolean({ description: 'True when the round cap reduced this spin’s win.' }),
  },
  { ...closed, title: 'SpinOutcome' },
);

export const FreeSpinsOutcome = Type.Object(
  {
    awarded: Type.Integer({ minimum: 1 }),
    retriggers: Type.Integer({ minimum: 0 }),
    spins: Type.Array(SpinOutcome),
    totalWin: Credits,
  },
  { ...closed, title: 'FreeSpinsOutcome' },
);

export const Round = Type.Object(
  {
    base: SpinOutcome,
    freeSpins: Type.Union([FreeSpinsOutcome, Type.Null()]),
    totalWin: Credits,
    maxWinReached: Type.Boolean(),
  },
  { ...closed, title: 'Round' },
);

export const SpinResponse = Type.Object(
  {
    requestId: Uuid,
    roundId: Uuid,
    bet: Credits,
    win: Credits,
    balanceBefore: Credits,
    balanceAfter: Credits,
    replayed: Type.Boolean({
      description: 'True when this is the stored result of an earlier request with the same requestId.',
    }),
    round: Round,
  },
  { ...closed, title: 'SpinResponse' },
);

export const HealthResponse = Type.Object({ status: Type.Literal('ok') }, { ...closed, title: 'HealthResponse' });

// ---------------------------------------------------------------- errors

/** Codes a server returns. Clients add their own transport codes (see errors.ts). */
export const ServerErrorCodes = [
  'VALIDATION_ERROR',
  'SESSION_NOT_FOUND',
  'IDEMPOTENCY_CONFLICT',
  'INVALID_BET',
  'INSUFFICIENT_FUNDS',
  'RATE_LIMITED',
  'INTERNAL_ERROR',
  'SERVICE_UNAVAILABLE',
] as const;

export const Problem = Type.Object(
  {
    type: Type.String({ description: 'URI reference identifying the problem type.' }),
    title: Type.String(),
    status: Type.Integer({ minimum: 400, maximum: 599 }),
    code: Type.Enum(ServerErrorCodes, { description: 'Stable machine-readable error code.' }),
    detail: Type.Optional(Type.String()),
    requestId: Type.Optional(Type.String({ description: 'The spin requestId, when the error concerns one.' })),
  },
  { title: 'Problem', description: 'RFC 9457 problem details (application/problem+json).' },
);

// ---------------------------------------------------------------- types

export type Position = Static<typeof Position>;
export type PayEntry = Static<typeof PayEntry>;
export type SymbolPays = Static<typeof SymbolPays>;
export type GameConfig = Static<typeof GameConfig>;
export type Session = Static<typeof Session>;
export type SpinRequest = Static<typeof SpinRequest>;
export type LineWin = Static<typeof LineWin>;
export type ScatterWin = Static<typeof ScatterWin>;
export type SpinOutcome = Static<typeof SpinOutcome>;
export type FreeSpinsOutcome = Static<typeof FreeSpinsOutcome>;
export type Round = Static<typeof Round>;
export type SpinResponse = Static<typeof SpinResponse>;
export type HealthResponse = Static<typeof HealthResponse>;
export type Problem = Static<typeof Problem>;
export type ServerErrorCode = (typeof ServerErrorCodes)[number];

/** Every named schema, keyed by its title: the OpenAPI components. */
export const NAMED_SCHEMAS: Readonly<Record<string, TSchema>> = {
  Position,
  PayEntry,
  SymbolPays,
  GameConfig,
  Session,
  SpinRequest,
  LineWin,
  ScatterWin,
  SpinOutcome,
  FreeSpinsOutcome,
  Round,
  SpinResponse,
  HealthResponse,
  Problem,
};
