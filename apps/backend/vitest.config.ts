import { defineConfig } from 'vitest/config';

// Backend unit tests target pure utility modules (crypto, storage driver,
// search query building) so they run fast without NestJS DI / decorator
// metadata. Service classes wrap these utilities.
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.spec.ts'],
    root: '.',
  },
});
