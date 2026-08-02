import { defineConfig } from 'oxfmt'

export default defineConfig({
  semi: false,
  singleQuote: true,
  tabWidth: 2,
  trailingComma: 'all',
  ignorePatterns: ['node_modules/**', 'dist/**'],
})
