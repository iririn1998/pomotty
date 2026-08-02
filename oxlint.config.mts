import { defineConfig } from 'oxlint'

export default defineConfig({
  categories: {
    correctness: 'warn',
  },
  plugins: ['typescript'],
  rules: {
    'no-debugger': 'error',
    'func-style': ['error', 'expression'],
    'prefer-arrow-callback': 'error',
  },
  ignorePatterns: ['node_modules/**', 'dist/**'],
})
