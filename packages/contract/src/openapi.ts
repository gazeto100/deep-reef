import { ERROR_INFO } from './errors';
import { NAMED_SCHEMAS, ServerErrorCodes, type ServerErrorCode } from './schemas';

/**
 * Builds the OpenAPI 3.1 document from the TypeBox schemas, so the spec can never drift
 * from the types and validators. scripts/build-openapi.ts writes it to openapi.yaml.
 * OpenAPI 3.1 uses JSON Schema 2020-12, so TypeBox schemas are valid as-is.
 */

export const API_VERSION = '1.0.0';

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

/** Plain JSON copy of a schema (drops TypeBox's internal symbol keys). */
function toJson(value: unknown): Json {
  return JSON.parse(JSON.stringify(value)) as Json;
}

/** Replaces every nested schema whose title names a component with a $ref to it. */
function referenceComponents(node: Json, isRoot: boolean): Json {
  if (Array.isArray(node)) return node.map((item) => referenceComponents(item, false));
  if (node === null || typeof node !== 'object') return node;

  const title = node['title'];
  if (!isRoot && typeof title === 'string' && title in NAMED_SCHEMAS) {
    return { $ref: `#/components/schemas/${title}` };
  }
  const out: { [key: string]: Json } = {};
  for (const [key, value] of Object.entries(node)) out[key] = referenceComponents(value, false);
  return out;
}

const ref = (name: string): Json => ({ $ref: `#/components/schemas/${name}` });
const json = (schema: Json): Json => ({ 'application/json': { schema } });

/**
 * Error responses for an operation, grouped by HTTP status. A status with one code
 * references that code's response component. A status shared by several codes (422:
 * INVALID_BET and INSUFFICIENT_FUNDS) gets one response that lists them.
 */
function problems(used: Set<ServerErrorCode>, ...codes: ServerErrorCode[]): Record<string, Json> {
  const byStatus = new Map<number, ServerErrorCode[]>();
  for (const code of codes) {
    const status = ERROR_INFO[code].status;
    byStatus.set(status, [...(byStatus.get(status) ?? []), code]);
  }
  const out: Record<string, Json> = {};
  for (const [status, group] of byStatus) {
    const [single] = group;
    if (group.length === 1 && single !== undefined) used.add(single);
    out[String(status)] =
      group.length === 1
        ? { $ref: `#/components/responses/${single ?? ''}` }
        : {
            description: `One of: ${group.map((c) => `${c} (${ERROR_INFO[c].title})`).join('; ')}.`,
            content: { 'application/problem+json': { schema: ref('Problem') } },
          };
  }
  return out;
}

const sessionIdParam: Json = {
  name: 'sessionId',
  in: 'path',
  required: true,
  description: 'Session identifier returned by createSession.',
  schema: { type: 'string', format: 'uuid' },
};

export function buildOpenApiDocument(): Json {
  const schemas: { [key: string]: Json } = {};
  for (const [name, schema] of Object.entries(NAMED_SCHEMAS)) schemas[name] = referenceComponents(toJson(schema), true);

  const used = new Set<ServerErrorCode>();
  const errors = (...codes: ServerErrorCode[]): Record<string, Json> => problems(used, ...codes);
  const paths = buildPaths(errors);

  // One reusable response per error code that an operation references on its own.
  const responses: { [key: string]: Json } = {};
  for (const code of ServerErrorCodes) {
    if (!used.has(code)) continue;
    responses[code] = {
      description: `${ERROR_INFO[code].title} (code ${code}).`,
      content: { 'application/problem+json': { schema: ref('Problem') } },
    };
  }

  return {
    openapi: '3.1.0',
    info: {
      title: 'Deep Reef Game Server API',
      version: API_VERSION,
      description:
        'Server side of the Deep Reef slot. Outcomes are computed entirely on the server; clients only display them. ' +
        'Spins are idempotent by requestId. Errors use RFC 9457 problem details with a stable `code`. ' +
        'Generated from packages/contract/src/schemas.ts; do not edit by hand.',
    },
    servers: [{ url: '/', description: 'Same origin as the API host' }],
    tags: [
      { name: 'sessions', description: 'Anonymous demo sessions and their wallet' },
      { name: 'spins', description: 'Game rounds' },
      { name: 'health', description: 'Liveness' },
    ],
    paths,
    components: { schemas, responses },
  };
}

function buildPaths(errors: (...codes: ServerErrorCode[]) => Record<string, Json>): Json {
  return {
    '/v1/sessions': {
      post: {
        operationId: 'createSession',
        tags: ['sessions'],
        summary: 'Create an anonymous demo session',
        description: 'Opens a session with the starting balance and returns the game configuration.',
        responses: {
          '201': { description: 'Session created.', content: json(ref('Session')) },
          ...errors('RATE_LIMITED', 'INTERNAL_ERROR', 'SERVICE_UNAVAILABLE'),
        },
      },
    },
    '/v1/sessions/{sessionId}': {
      get: {
        operationId: 'getSession',
        tags: ['sessions'],
        summary: 'Get a session (balance and game configuration)',
        parameters: [sessionIdParam],
        responses: {
          '200': { description: 'The session: balance and game configuration.', content: json(ref('Session')) },
          ...errors('VALIDATION_ERROR', 'SESSION_NOT_FOUND', 'RATE_LIMITED', 'INTERNAL_ERROR'),
        },
      },
    },
    '/v1/sessions/{sessionId}/spins': {
      post: {
        operationId: 'spin',
        tags: ['spins'],
        summary: 'Play one round',
        description:
          'Debits the bet, plays the complete round (free spins included) and credits the win in one atomic step. ' +
          'Repeating a request with the same requestId returns the stored result with `replayed: true` and does ' +
          'not charge again; reusing a requestId with a different bet fails with IDEMPOTENCY_CONFLICT. ' +
          'Status 422 covers INVALID_BET and INSUFFICIENT_FUNDS; the `code` tells them apart.',
        parameters: [sessionIdParam],
        requestBody: { required: true, content: json(ref('SpinRequest')) },
        responses: {
          '200': { description: 'Round result (new or replayed).', content: json(ref('SpinResponse')) },
          ...errors(
            'VALIDATION_ERROR',
            'SESSION_NOT_FOUND',
            'IDEMPOTENCY_CONFLICT',
            'INVALID_BET',
            'INSUFFICIENT_FUNDS',
            'RATE_LIMITED',
            'INTERNAL_ERROR',
            'SERVICE_UNAVAILABLE',
          ),
        },
      },
    },
    '/health': {
      get: {
        operationId: 'health',
        tags: ['health'],
        summary: 'Liveness check',
        responses: { '200': { description: 'The server is up.', content: json(ref('HealthResponse')) } },
      },
    },
  };
}
