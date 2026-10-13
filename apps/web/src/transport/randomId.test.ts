import { afterEach, describe, expect, it, vi } from 'vitest';
import { randomId } from './randomId';

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('randomId', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('returns a v4 UUID', () => {
    expect(randomId()).toMatch(UUID_V4);
  });

  it('falls back to getRandomValues outside a secure context (plain HTTP)', () => {
    vi.stubGlobal('isSecureContext', false);
    const ids = new Set(Array.from({ length: 1000 }, randomId));
    expect(ids.size).toBe(1000);
    for (const id of ids) expect(id).toMatch(UUID_V4);
  });
});
