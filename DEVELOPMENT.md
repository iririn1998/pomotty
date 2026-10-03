# Development guide

English | [日本語](./DEVELOPMENT.ja.md)

For installation and usage, see the [user README](./README.md).

## Development

```shell
pnpm install --frozen-lockfile
pnpm start
pnpm typecheck
pnpm test
pnpm lint
pnpm format:check
```

`pnpm check` runs the type check, build, and tests in that order. Tests use
Vitest, and imports across `src/` use the `#src/*` subpath imports defined in
`package.json`, so `node src/cli.ts` also runs the CLI without building it.
CI runs these checks on macOS, Ubuntu, and Windows with Node.js 22.18.x and
24.11.x, and on Ubuntu with the latest Node.js 24 and current releases.

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

The Release workflow runs linting and formatting checks before publishing, and
creating the package runs `pnpm check` (type check, build, and tests) through
`prepack`. The package includes the CLI, notification sounds, README.md,
README.ja.md, LICENSE, and package.json. To check the package contents locally,
run `pnpm publish --dry-run --no-git-checks`.

npm authentication uses
[trusted publishing](https://docs.npmjs.com/trusted-publishers), so no npm token
is stored in the repository.
