// @ts-check
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

/**
 * Flat config. ESLint 9 dropped `.eslintrc`, and 8.x is end of life and no
 * longer receives security fixes, so the format came with the upgrade rather
 * than by choice.
 */
export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**', 'coverage/**'] },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  {
    files: ['**/*.ts', '**/*.mjs', '**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.browser, ...globals.node },
    },
    rules: {
      // CLAUDE.md asks for no `any` without a reason, and the codebase has
      // none. Enforcing it costs nothing today and keeps it that way.
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      'no-console': ['warn', { allow: ['info', 'warn', 'error'] }],
    },
  },

  {
    // The harness deliberately models untyped external contracts: `ha-form`'s
    // data container really is an arbitrary object, and the whole point of the
    // stub is to mirror that shape rather than improve on it. Narrowing it to
    // `unknown` would add casts to code that never ships and would make the
    // stub diverge from the thing it exists to imitate.
    files: ['dev/**'],
    rules: { '@typescript-eslint/no-explicit-any': 'off' },
  },

  {
    // Build tooling reports to the terminal; that is its output, not a stray log.
    files: ['scripts/**'],
    rules: { 'no-console': 'off' },
  },
);
