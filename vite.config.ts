import { defineConfig } from 'vite';

/**
 * Dev server only. The shipped bundle is built by `scripts/build.mjs` with
 * esbuild — Vite's lib mode does not apply minification here, and the card is
 * distributed as one self-contained file where size matters.
 */
export default defineConfig({
  root: 'dev',
  server: {
    port: 5173,
    open: true,
  },
});
