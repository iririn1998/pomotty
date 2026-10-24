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

## Testing

```shell
pnpm test           # Run all tests once
pnpm test:watch     # Re-run tests on file changes
pnpm test:coverage  # Measure coverage and write an HTML report to coverage/
```

Unit tests sit next to their implementation with the same base name.
`src/cli/scenario.test.ts` checks how the whole app behaves from the user's point
of view. It uses `startScenario()` from `src/cli/scenario.test-helper.ts`, which
runs the CLI with a virtual clock, terminal, and keyboard, so a test reads like a
script:

```ts
const app = await startScenario({ arguments_: ['--work', '1', '--break', '1'] });

await app.press('enter'); // Select OK in the start confirmation
await app.advance('0:20'); // Run the timer ticks for 20 seconds
await app.press('space'); // Pause

expect(readBigClock(app.terminal.lines())).toBe('0:40');
expect(app.log()).toEqual([]); // No sound has played yet
```

- `press()` writes the same bytes a real terminal sends (`'space'`, `'enter'`,
  `'up'`, `'ctrl+c'`, and so on), and the keys pass through Node.js key decoding.
- `advance()` moves time forward and runs every due tick in order. `stall()`
  delays ticks, `suspend()` simulates OS sleep, and `shiftClock()` shifts only
  the wall clock.
- `terminal` interprets the escape sequences the app writes and rebuilds the
  screen the user sees. `lines()` returns plain text, `coloredLines()` marks
  colored parts with `<red>` and `<green>`, and `wraps()` counts automatic line
  wraps at the right edge.
- `log()` returns side effects such as sounds, exit codes, and shutdown with
  timestamps, like `'15:00.000 play:work'`.

`pnpm test:coverage` fails when coverage drops below the thresholds in
`vitest.config.ts`. `src/cli.ts` is excluded because `src/cli.test.ts` runs it in
a child process.

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
