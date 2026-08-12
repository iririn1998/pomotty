import {
  defineConfig,
  enforceFilenameCasing,
  enforceTdd,
  forbidCommandPattern,
  forbidContentPattern,
  requireCommand,
} from '@nizos/probity';

const CODE_FILES = ['src/**', 'test/**', 'scripts/**'] as const;

export default defineConfig({
  rules: [
    forbidCommandPattern({
      match: /\brm\s+(?:-\S+\s+)*-\S*[rR]/u,
      reason: '再帰削除は使用しません。削除対象を個別に指定するか、ユーザーへ依頼してください。',
    }),
    forbidCommandPattern({
      match: /git\s+(?:reset\s+--hard\b|clean\s+-\S*[dfx]|checkout\s+--\s|restore\b)/u,
      reason:
        '作業ツリーを破棄するgitコマンドは使用しません。変更の取り消しが必要な場合はユーザーへ依頼してください。',
    }),
    forbidCommandPattern({
      match: /git\s+push\b[^&|;]*(?:--force\b(?!-with-lease)|\s-f\b)/u,
      reason:
        'force pushは使用しません。必要な場合は--force-with-leaseをユーザーへ依頼してください。',
    }),
    forbidCommandPattern({
      match: /git\s+commit\b[^&|;]*(?:--no-verify\b|\s-n\b)/u,
      reason: 'コミットフックの迂回は禁止です。フックが失敗する原因を修正してください。',
    }),
    forbidCommandPattern({
      match:
        /\b(?:npm\s+(?:install|i|ci|add|update|uninstall|remove|rm)\b|yarn\b|bun\s+(?:install|add)\b)/u,
      reason:
        'このリポジトリのパッケージマネージャはpnpmです。pnpm install / pnpm add を使用してください。',
    }),
    requireCommand({
      after: { kind: 'write' },
      before: { kind: 'command', match: /git\s+commit\b/u },
      command: /\bpnpm\s+(?:run\s+)?(?:check|lint|test)\b/u,
      reason:
        'コミット前にpnpm run check（未整備の間はpnpm run lint / pnpm test）を実行してください。直近のチェック以降にファイルを変更した場合は再実行が必要です。',
    }),
    {
      files: CODE_FILES,
      rules: [
        enforceFilenameCasing({ style: 'kebab-case' }),
        forbidContentPattern({
          match: /(?:oxlint|eslint)-disable/u,
          reason:
            'lintの抑制コメントは使用しません。oxlint.config.mtsは全カテゴリをerrorに設定しています。指摘は抑制せずコードを修正してください。',
        }),
        forbidContentPattern({
          match: /@ts-(?:ignore|expect-error|nocheck)\b/u,
          reason: '型チェックの抑制コメントは使用しません。型が合わない原因を修正してください。',
        }),
        forbidContentPattern({
          match: /\b(?:describe|it|suite|test)\.only\b/u,
          reason:
            '.onlyはテストスイートの大半を無効化したまま緑に見せます。実行対象の絞り込みはコマンド側で行ってください。',
        }),
      ],
    },
    {
      files: ['src/**', 'test/**'],
      rules: [enforceTdd()],
    },
  ],
});
