import { defineConfig } from 'oxlint'

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
  ignorePatterns: ['.pnpm-store/**', 'node_modules/**', 'dist/**'],
  options: {
    denyWarnings: true,
    reportUnusedDisableDirectives: 'error',
  },
  overrides: [
    {
      files: ['*.config.mts', '*.config.ts'],
      rules: {
        'import/no-default-export': 'off',
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
})
