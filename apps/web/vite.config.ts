import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Resolve workspace packages to their source so dev/build/test run without a
// separate package build step (Vite resolves the .js specifiers to .ts).
const alias = {
  '@echovault/audio-engine': fileURLToPath(
    new URL('../../packages/audio-engine/src/index.ts', import.meta.url),
  ),
  '@echovault/shared': fileURLToPath(
    new URL('../../packages/shared/src/index.ts', import.meta.url),
  ),
};

export default defineConfig({
  plugins: [react()],
  resolve: { alias },
  server: { port: 5173 },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
