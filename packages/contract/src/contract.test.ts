import { readFileSync } from 'node:fs';
import Value from 'typebox/value';
import { describe, expect, it } from 'vitest';
import { OPENAPI_PATH, renderOpenApiYaml } from '../scripts/openapiYaml';
import { ClientErrorCodes, ERROR_INFO, GameServerError } from './errors';
import { buildOpenApiDocument } from './openapi';
import { NAMED_SCHEMAS, Problem, ServerErrorCodes, SpinRequest } from './schemas';

const UUID = '6f1c2a9e-3b4d-4e5f-8a7b-9c0d1e2f3a4b';

describe('openapi.yaml', () => {
  it('is up to date with the schemas (run `npm run openapi -w @deep-reef/contract`)', () => {
    expect(readFileSync(OPENAPI_PATH, 'utf8')).toBe(renderOpenApiYaml());
  });

  it('declares every named schema as a component and references nested ones', () => {
    const text = JSON.stringify(buildOpenApiDocument());
    for (const name of Object.keys(NAMED_SCHEMAS)) {
      expect(text).toContain(`"#/components/schemas/${name}"`);
    }
    // A nested schema is a $ref, so a component's title appears once (in its own definition).
    expect(text.match(/"title":"SpinOutcome"/g)).toHaveLength(1);
  });

  it('uses no draft-07 tuple syntax (invalid in OpenAPI 3.1 / JSON Schema 2020-12)', () => {
    const walk = (node: unknown): boolean =>
      Array.isArray(node)
        ? node.some(walk)
        : node !== null && typeof node === 'object'
          ? Object.entries(node).some(([key, value]) => (key === 'items' && Array.isArray(value)) || walk(value))
          : false;
    expect(walk(buildOpenApiDocument())).toBe(false);
  });
});

describe('schemas', () => {
  it('accept a valid spin request', () => {
    expect(Value.Check(SpinRequest, { requestId: UUID, bet: 20 })).toBe(true);
  });

  it.each([
    ['a requestId that is not a UUID', { requestId: 'abc', bet: 20 }],
    ['a zero bet', { requestId: UUID, bet: 0 }],
    ['a fractional bet', { requestId: UUID, bet: 2.5 }],
    ['unknown properties', { requestId: UUID, bet: 20, cheat: true }],
    ['a missing bet', { requestId: UUID }],
  ])('reject %s', (_label, body) => {
    expect(Value.Check(SpinRequest, body)).toBe(false);
  });
});

describe('GameServerError', () => {
  it.each(ServerErrorCodes)('%s maps to a valid problem document and back', (code) => {
    const error = new GameServerError(code, 'details', { requestId: UUID });
    const problem = error.toProblem();
    expect(Value.Check(Problem, problem)).toBe(true);
    expect(problem.status).toBe(ERROR_INFO[code].status);

    const back = GameServerError.fromProblem(problem);
    expect(back.code).toBe(code);
    expect(back.message).toBe('details');
    expect(back.requestId).toBe(UUID);
  });

  it('client-side codes have no HTTP representation', () => {
    for (const code of ClientErrorCodes) {
      expect(() => new GameServerError(code).toProblem()).toThrow('client-side');
    }
  });

  it('INSUFFICIENT_FUNDS and INVALID_BET are 422; only transient failures are retryable', () => {
    expect(new GameServerError('INSUFFICIENT_FUNDS').status).toBe(422);
    expect(new GameServerError('INVALID_BET').status).toBe(422);
    const retryable = Object.entries(ERROR_INFO)
      .filter(([, info]) => info.retryable)
      .map(([code]) => code)
      .sort();
    expect(retryable).toEqual(['INTERNAL_ERROR', 'NETWORK_ERROR', 'RATE_LIMITED', 'SERVICE_UNAVAILABLE', 'TIMEOUT']);
  });
});
