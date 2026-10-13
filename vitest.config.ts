import { defineConfig } from 'vitest/config';

const nodePackage = (name: string) => ({
  test: {
    name,
    root: `./packages/${name}`,
    include: ['src/**/*.test.ts'],
    environment: 'node' as const,
  },
});

// One `vitest run` at the root runs every workspace. A workspace with its own
// vite/vitest config (apps/web) uses it; the packages share the defaults above.
export default defineConfig({
  test: {
    projects: ['apps/web', nodePackage('math'), nodePackage('contract'), nodePackage('game-service')],
  },
});
