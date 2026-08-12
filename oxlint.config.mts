import { defineConfig } from 'oxlint';

export default defineConfig({
  categories: {
    correctness: 'error',
    nursery: 'error',
    pedantic: 'error',
    perf: 'error',
    restriction: 'error',
    style: 'error',
    suspicious: 'error',
  },
  env: {
    node: true,
  },
  ignorePatterns: ['.pnpm-store/**', 'node_modules/**', 'dist/**'],
  options: {
    denyWarnings: true,
    reportUnusedDisableDirectives: 'error',
  },
  overrides: [
    {
      files: ['*.config.mjs', '*.config.mts', '*.config.ts'],
      rules: {
        'import/no-default-export': 'off',
      },
    },
    {
      files: ['src/timer.ts', 'src/timer.test.ts'],
      rules: {
        'oxc/no-async-await': 'off',
      },
    },
    {
      files: ['src/timer.ts'],
      rules: {
        'sort-vars': 'off',
      },
    },
    {
      files: ['src/timer.test.ts'],
      rules: {
        'no-duplicate-imports': 'off',
      },
    },
    {
      files: ['scripts/generate-sounds.mjs'],
      rules: {
        'max-statements': 'off',
        'no-magic-numbers': 'off',
        'node/no-top-level-await': 'off',
        'one-var': 'off',
        'oxc/no-async-await': 'off',
        'sort-vars': 'off',
      },
    },
    {
      files: ['src/notification-sound.ts'],
      rules: {
        'sort-vars': 'off',
      },
    },
    {
      files: ['src/notification-sound.test.ts'],
      rules: {
        'no-duplicate-imports': 'off',
        'oxc/no-async-await': 'off',
      },
    },
    {
      files: ['src/cli.ts'],
      rules: {
        'node/no-top-level-await': 'off',
      },
    },
    {
      files: [
        'src/cli/confirm-start.ts',
        'src/cli/confirm-start.test.ts',
        'src/cli/run.ts',
        'src/cli.test.ts',
      ],
      rules: {
        'no-duplicate-imports': 'off',
        'oxc/no-async-await': 'off',
      },
    },
    {
      files: ['src/cli/confirm-start.ts'],
      rules: {
        'no-await-in-loop': 'off',
        'sort-vars': 'off',
      },
    },
  ],
  plugins: ['import', 'node', 'oxc', 'promise', 'typescript', 'unicorn'],
  rules: {
    'func-style': ['error', 'expression'],
    'import/no-named-export': 'off',
    'import/no-nodejs-modules': 'off',
    'import/prefer-default-export': 'off',
    'no-debugger': 'error',
    'prefer-arrow-callback': 'error',
    'typescript/consistent-type-definitions': ['error', 'type'],
  },
});
