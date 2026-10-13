import { fileURLToPath, URL } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

const fromHere = (path: string): string => fileURLToPath(new URL(path, import.meta.url));

// Mirrors "paths" in tsconfig.app.json.
const alias = {
  '@framework': fromHere('./src/framework'),
  '@games': fromHere('./src/games'),
  '@ui': fromHere('./src/ui'),
  '@transport': fromHere('./src/transport'),
};

export default defineConfig({
  // Relative asset URLs: the build works from any folder or subdomain (cPanel), unchanged.
  base: './',
  plugins: [react()],
  resolve: { alias },
  build: {
    rollupOptions: {
      output: {
        // React/Redux in their own chunk, so a new game build does not invalidate it.
        // Pixi is left to its own chunking: it lazy-loads its renderers (WebGL, WebGPU)
        // and forcing it into one chunk would ship code the browser never runs.
        manualChunks(id: string) {
          if (/node_modules\/(react|react-dom|scheduler|react-redux|@reduxjs|redux|immer|reselect)\//.test(id)) {
            return 'react';
          }
          return undefined;
        },
      },
    },
  },
  test: {
    name: 'web',
    include: ['src/**/*.test.{ts,tsx}'],
    environment: 'node',
  },
});
