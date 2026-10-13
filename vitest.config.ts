import { defineConfig } from 'vitest/config';

// One `vitest run` at the root runs every workspace. A workspace with its own
// vite/vitest config (apps/web) uses it; the others get the defaults below.
export default defineConfig({
  test: {
    projects: [
      'apps/web',
      {
        test: {
          name: 'math',
          root: './packages/math',
          include: ['src/**/*.test.ts'],
          environment: 'node',
        },
      },
    ],
  },
});
