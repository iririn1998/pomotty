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
