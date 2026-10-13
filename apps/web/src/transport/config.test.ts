import { describe, expect, it } from 'vitest';
import { FLAKY_NETWORK, readTransportConfig } from './config';
import { createGameServer } from './createGameServer';

describe('readTransportConfig', () => {
  it('defaults to the in-browser mock without faults', () => {
    expect(readTransportConfig({})).toEqual({ kind: 'mock', apiUrl: undefined, mockFaults: {}, timeoutMs: 3000 });
  });

  it('reads the flaky preset, timeout and http settings', () => {
    expect(readTransportConfig({ VITE_MOCK_FAULTS: 'flaky' }).mockFaults).toBe(FLAKY_NETWORK);
    expect(readTransportConfig({ VITE_SERVER_TIMEOUT_MS: '5000' }).timeoutMs).toBe(5000);
    expect(readTransportConfig({ VITE_GAME_SERVER: 'http', VITE_API_URL: 'http://localhost:3000' })).toMatchObject({
      kind: 'http',
      apiUrl: 'http://localhost:3000',
    });
  });

  it.each([
    [{ VITE_GAME_SERVER: 'grpc' }, 'VITE_GAME_SERVER'],
    [{ VITE_GAME_SERVER: 'http' }, 'VITE_API_URL is required'],
    [{ VITE_MOCK_FAULTS: 'chaos' }, 'VITE_MOCK_FAULTS'],
    [{ VITE_SERVER_TIMEOUT_MS: 'soon' }, 'VITE_SERVER_TIMEOUT_MS'],
    [{ VITE_SERVER_TIMEOUT_MS: '10' }, 'VITE_SERVER_TIMEOUT_MS'],
  ])('fails loudly on invalid settings %j', (env, message) => {
    expect(() => readTransportConfig(env)).toThrow(message);
  });
});

describe('createGameServer', () => {
  it('builds a working mock-backed GameServer from the configuration', async () => {
    const server = await createGameServer(readTransportConfig({}), { mock: { latencyMs: [0, 0] } });
    const session = await server.createSession();
    const spin = await server.spin(session.sessionId, {
      requestId: crypto.randomUUID(),
      bet: session.config.betLevels[0] ?? 20,
    });
    expect(spin.balanceAfter).toBe(session.balance - spin.bet + spin.win);
  });

  it('reports that the HTTP transport is not available yet', async () => {
    await expect(
      createGameServer(readTransportConfig({ VITE_GAME_SERVER: 'http', VITE_API_URL: 'http://x' })),
    ).rejects.toThrow('phase 3b');
  });
});
