# 開発ガイド

[English](./DEVELOPMENT.md) | 日本語

インストール方法と使い方は[利用者向けREADME](./README.ja.md)を参照してください。

## 開発

```shell
pnpm install --frozen-lockfile
pnpm start
pnpm typecheck
pnpm test
pnpm lint
pnpm format:check
```

`pnpm check`は型チェック、ビルド、テストを順に実行します。テストにはVitestを使用し、
`src/`内の機能をまたぐimportには`package.json`の`imports`で定義した`#src/*`を使うため、
ビルドせずに`node src/cli.ts`でもCLIを起動できます。
CIはmacOS、Ubuntu、WindowsのNode.js 22.18.xと24.11.x、およびUbuntuの最新のNode.js 24と
最新安定版でこれらの検証を実行します。

## テスト

```shell
pnpm test           # すべてのテストを1回実行する
pnpm test:watch     # ファイルの変更を監視してテストを再実行する
pnpm test:coverage  # カバレッジを計測し、coverage/にHTMLレポートを出力する
```

単体テストは対象実装と同じディレクトリに同じベース名で置きます。
`src/cli/scenario.test.ts`は、利用者から見たアプリ全体の振る舞いを検証します。
`src/cli/scenario.test-helper.ts`の`startScenario()`が仮想の時計・端末・キーボードで
CLIを実行するため、テストを台本のように記述できます。

```ts
const app = await startScenario({ arguments_: ['--work', '1', '--break', '1'] });

await app.press('enter'); // 開始確認でOKを選ぶ
await app.advance('0:20'); // 20秒分のtickを実行する
await app.press('space'); // 一時停止する

expect(readBigClock(app.terminal.lines())).toBe('0:40');
expect(app.log()).toEqual([]); // まだ音は鳴っていない
```

- `press()`は実際の端末と同じバイト列（`'space'`、`'enter'`、`'up'`、`'ctrl+c'`など）を
  送り、Node.jsのキー解釈を経てアプリへ届けます。
- `advance()`は時間を進め、期限が来たtickを順番に実行します。`stall()`はtickの遅れ、
  `suspend()`はOSのスリープ、`shiftClock()`は壁時計だけのずれを再現します。
- `terminal`はアプリが書き込んだ制御列を解釈し、利用者が見る画面を再現します。
  `lines()`は文字だけ、`coloredLines()`は色の付いた部分を`<red>`と`<green>`で囲んで返し、
  `wraps()`は右端での自動折り返しの回数を返します。
- `log()`は音の再生、終了コード、終了処理などの外部への作用を、
  `'15:00.000 play:work'`のように発生時刻付きで返します。

`pnpm test:coverage`は、カバレッジが`vitest.config.ts`の閾値を下回ると失敗します。
`src/cli.ts`は`src/cli.test.ts`が子プロセスとして起動するため、計測の対象外です。

## リリース

`v*`タグをpushすると[Releaseワークフロー](./.github/workflows/release.yml)が実行されます。
タグと`package.json`のバージョンが一致することを確認したうえで、npmへ公開し、
同じバージョンのGitHub Releaseを作成するため、npmとGitHub Releasesは常に一致します。
ローカルでは`pnpm publish`を実行しないでください。

先に変更をコミットしてから、変更内容に応じて`pnpm version patch`、
`pnpm version minor`、`pnpm version major`でバージョンを更新します。
これらのコマンドはGitコミットと`v<バージョン>`タグを作成するので、両方をpushします。

```shell
pnpm version patch
git push --follow-tags
```

Releaseワークフローは公開前にlintとフォーマット検証を実行し、パッケージ作成時には
`prepack`から`pnpm check`（型チェック、ビルド、テスト）が実行されます。
配布物にはCLI、通知音、README.md、README.ja.md、LICENSE、package.jsonが含まれます。
配布物の内容は`pnpm publish --dry-run --no-git-checks`でローカル確認できます。

npmの認証には[Trusted Publishing](https://docs.npmjs.com/trusted-publishers)を使用するため、
リポジトリにnpmトークンは保存しません。
