import { defineConfig } from 'oxfmt';

export default defineConfig({
  ignorePatterns: ['.pnpm-store/**', 'node_modules/**', 'dist/**'],
  semi: true,
  singleQuote: true,
  tabWidth: 2,
  trailingComma: 'all',
});
