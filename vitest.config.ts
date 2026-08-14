import { defineConfig } from 'vitest/config';

/**
 * Kept separate from vite.config.ts, which sets `root: 'dev'` for the dev
 * harness and would otherwise hide the test directory from Vitest.
 */
export default defineConfig({
  test: {
    root: '.',
    include: ['test/**/*.test.ts'],
    environment: 'node',
  },
});
