# 開発ガイド

[English](./DEVELOPMENT.md) | 日本語

インストール方法と使い方は[利用者向けREADME](./README.ja.md)を参照してください。

## 開発

```shell
pnpm install --frozen-lockfile
pnpm start
pnpm test
pnpm lint
pnpm format:check
```

## npmへの公開・更新

開発と公開にはpnpmを使用します。初回または認証が切れた場合は
`pnpm login --registry=https://registry.npmjs.org/`でnpmへログインします。

更新時は変更内容に応じて`pnpm version patch`、`pnpm version minor`、
`pnpm version major`で未公開のバージョンへ更新します。
これらのコマンドはGitコミットとタグも作成するため、先に変更をコミットしてください。

```shell
pnpm publish --dry-run --no-git-checks
pnpm publish
```

公開前にテスト・lint・フォーマット検証が実行され、パッケージ作成時にビルドされます。
配布物にはCLI、通知音、README、package.jsonが含まれます。
公開時にnpmから認証を求められたら、表示される案内に従って完了してください。
