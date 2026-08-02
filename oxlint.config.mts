import { defineConfig } from 'oxlint'

export default defineConfig({
  categories: {
    correctness: 'warn',
  },
  plugins: ['typescript'],
  rules: {
    'no-debugger': 'error',
  },
  ignorePatterns: ['node_modules/**', 'dist/**'],
})
