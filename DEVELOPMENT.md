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

## Releasing

Releases are published by the [Release workflow](./.github/workflows/release.yml)
when a `v*` tag is pushed. It checks that the tag matches the `package.json`
version, publishes the package to npm, and creates a GitHub release with the
same version, so npm and GitHub releases always stay in sync. Do not run
`pnpm publish` locally.

Commit your changes first, then bump the version with `pnpm version patch`,
`pnpm version minor`, or `pnpm version major` according to the changes. These
commands create a Git commit and a `v<version>` tag. Push both:

```shell
pnpm version patch
git push --follow-tags
```

Tests, linting, and formatting checks run before publishing, and the project is
built when the package is created. The package includes the CLI, notification
sounds, README, and package.json. To check the package contents locally, run
`pnpm publish --dry-run --no-git-checks`.

npm authentication uses
[trusted publishing](https://docs.npmjs.com/trusted-publishers), so no npm token
is stored in the repository.
