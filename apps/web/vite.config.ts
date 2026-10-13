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
  plugins: [react()],
  resolve: { alias },
  test: {
    name: 'web',
    include: ['src/**/*.test.{ts,tsx}'],
    environment: 'node',
  },
});
