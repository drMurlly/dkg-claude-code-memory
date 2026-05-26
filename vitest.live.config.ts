import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/live-integration.test.ts'],
    fileParallelism: false,
    testTimeout: 60000,
    hookTimeout: 30000,
    globals: true,
    environment: 'node',
    resolve: {
      extensions: ['.ts', '.js'],
    },
  },
  resolve: {
    extensions: ['.ts', '.js'],
  },
});
