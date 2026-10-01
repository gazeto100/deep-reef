import { fileURLToPath, URL } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

const fromRoot = (path: string): string => fileURLToPath(new URL(path, import.meta.url));

// Mirrors "paths" in tsconfig.base.json.
const alias = {
  '@math': fromRoot('./src/math'),
  '@framework': fromRoot('./src/framework'),
  '@games': fromRoot('./src/games'),
  '@server': fromRoot('./src/server'),
  '@ui': fromRoot('./src/ui'),
};

export default defineConfig({
  plugins: [react()],
  resolve: { alias },
  test: {
    include: ['src/**/*.test.{ts,tsx}'],
    environment: 'node',
  },
});
