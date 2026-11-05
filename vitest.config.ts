import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      // `src/cli.ts`は`src/cli.test.ts`が子プロセスとして起動するため、計測の対象外です。
      exclude: ['src/cli.ts', 'src/**/*.test.ts', 'src/**/*.test-helper.ts'],
      include: ['src/**/*.ts'],
      provider: 'v8',
      reporter: ['text', 'html'],
      thresholds: {
        branches: 90,
        functions: 95,
        lines: 95,
        statements: 95,
      },
    },
  },
});
