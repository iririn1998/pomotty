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

公開前にテスト・lint・フォーマット検証が実行され、パッケージ作成時にビルドされます。
配布物にはCLI、通知音、README、package.jsonが含まれます。
配布物の内容は`pnpm publish --dry-run --no-git-checks`でローカル確認できます。

npmの認証には[Trusted Publishing](https://docs.npmjs.com/trusted-publishers)を使用するため、
リポジトリにnpmトークンは保存しません。
