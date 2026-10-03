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
      files: ['src/timer/timer.ts', 'src/timer/timer.test.ts'],
      rules: {
        'oxc/no-async-await': 'off',
      },
    },
    {
      files: ['src/timer/timer.ts'],
      rules: {
        'sort-vars': 'off',
      },
    },
    {
      files: ['src/timer/timer.test.ts'],
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
      files: ['src/notification/sound.ts'],
      rules: {
        'sort-vars': 'off',
      },
    },
    {
      files: ['src/notification/sound.test.ts'],
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
        'src/terminal/input.ts',
        'src/terminal/input.test.ts',
        'src/cli/run.ts',
        'src/cli/run.test.ts',
      ],
      rules: {
        'max-statements': 'off',
        'no-duplicate-imports': 'off',
        'oxc/no-async-await': 'off',
      },
    },
    {
      files: ['src/diagnostics/escape.ts', 'src/diagnostics/escape.test.ts'],
      rules: {
        'no-control-regex': 'off',
        'sort-vars': 'off',
      },
    },
    {
      files: ['src/cli/parse-arguments.ts'],
      rules: {
        'max-lines-per-function': 'off',
        'max-statements': 'off',
        'one-var': 'off',
        'sort-vars': 'off',
      },
    },
    {
      files: ['src/terminal/input.ts'],
      rules: {
        'max-lines-per-function': 'off',
        'max-statements': 'off',
        'no-await-in-loop': 'off',
        'sort-vars': 'off',
      },
    },
    {
      files: ['src/terminal/input.test.ts'],
      rules: {
        'sort-imports': 'off',
        'sort-vars': 'off',
      },
    },
    {
      files: ['src/terminal/input.ts'],
      rules: {
        'sort-imports': 'off',
      },
    },
    {
      // 終了処理、子プロセス追跡、コマンド解決、絶対時刻タイマーの実装です。
      // 省略可能な依存とAbortSignalを扱うため、オプショナルチェーンと
      // `undefined`の比較を使い、意図的に待たないPromiseを`void`で示します。
      files: [
        'src/cli.ts',
        'src/cli/run.ts',
        'src/notification/operation.ts',
        'src/notification/sound.ts',
        'src/platform/commands.ts',
        'src/terminal/input.ts',
        'src/terminal/output.ts',
        'src/timer/timer.ts',
      ],
      rules: {
        'init-declarations': 'off',
        'max-lines-per-function': 'off',
        'max-statements': 'off',
        'no-duplicate-imports': 'off',
        'no-undefined': 'off',
        'no-void': 'off',
        'one-var': 'off',
        'oxc/no-async-await': 'off',
        'oxc/no-optional-chaining': 'off',
        'oxc/no-rest-spread-properties': 'off',
        'sort-vars': 'off',
      },
    },
    {
      // 子プロセスのイベントとtimerを扱うため、コールバックとPromiseを直接使います。
      files: ['src/notification/operation.ts', 'src/notification/sound.ts'],
      rules: {
        'max-lines': 'off',
        'max-params': 'off',
        'promise/always-return': 'off',
        'promise/avoid-new': 'off',
        'promise/no-multiple-resolved': 'off',
        'promise/prefer-await-to-callbacks': 'off',
        'promise/prefer-await-to-then': 'off',
      },
    },
    {
      // 外部コマンドは端末初期化前に1回だけ同期的に解決します。
      files: ['src/platform/commands.ts'],
      rules: {
        'node/no-sync': 'off',
      },
    },
    {
      // テストでは偽の時計、ストリーム、子プロセスを組み立てるため、
      // 期待値の数値、`null`を含むNode.js互換のイベント値、Promiseを直接扱います。
      files: ['src/**/*.test.ts', 'src/**/*.test-helper.ts'],
      rules: {
        'init-declarations': 'off',
        'max-lines': 'off',
        'max-lines-per-function': 'off',
        'max-statements': 'off',
        'no-duplicate-imports': 'off',
        'no-magic-numbers': 'off',
        'no-ternary': 'off',
        'no-undefined': 'off',
        'no-void': 'off',
        'one-var': 'off',
        'oxc/no-async-await': 'off',
        'oxc/no-optional-chaining': 'off',
        'oxc/no-rest-spread-properties': 'off',
        'promise/always-return': 'off',
        'promise/avoid-new': 'off',
        'promise/prefer-await-to-then': 'off',
        'sort-imports': 'off',
        'sort-vars': 'off',
        'unicorn/no-null': 'off',
        'unicorn/prefer-event-target': 'off',
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
