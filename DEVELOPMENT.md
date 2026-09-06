# Development guide

English | [日本語](./DEVELOPMENT.ja.md)

For installation and usage, see the [user README](./README.md).

## Development

```shell
pnpm install --frozen-lockfile
pnpm start
pnpm test
pnpm lint
pnpm format:check
```

## Publishing and updating on npm

Use pnpm for development and publishing. Before your first publish, or when your
authentication expires, sign in to npm with
`pnpm login --registry=https://registry.npmjs.org/`.

For updates, choose `pnpm version patch`, `pnpm version minor`, or
`pnpm version major` according to the changes to bump to an unpublished version.
Commit your changes first, as these commands also create a Git commit and tag.

```shell
pnpm publish --dry-run --no-git-checks
pnpm publish
```

Tests, linting, and formatting checks run before publishing, and the project is
built when the package is created. The package includes the CLI, notification
sounds, README, and package.json. If npm requests authentication during
publishing, follow the displayed instructions to complete it.
