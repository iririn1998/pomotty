# pomotty

English | [日本語](./README.ja.md)

A Pomodoro timer for the terminal, available on Node.js 22 or later.

```shell
npx pomotty
```

To install it globally, run:

```shell
npm install --global pomotty
pomotty
```

Run `pomotty` to display the start menu. Use the up and down arrow keys to select
`OK`, then press Enter to start 3 cycles of 15 minutes of work and 5 minutes of
break. Select `NG` to exit without starting the timer.

```shell
pomotty
```

Work and break durations accept whole numbers from 1 to 1440, in minutes. If you
specify only one duration, the other uses its default value.

```shell
pomotty --work 30 --break 10
pomotty --work=45 --break=15
```

Use `--roop` to set the number of work and break cycles. It defaults to 3 and
accepts whole numbers from 1 to 9007199254740991. The start confirmation appears
only once, and the timer exits after the final break finishes.

```shell
pomotty --roop 5
pomotty --work=25 --break=5 --roop=2
```

To see the available options, run:

```shell
pomotty --help
```

Different notification sounds play when work and break sessions end. Sound
playback uses `afplay` on macOS, `paplay` or `aplay` on Linux, and PowerShell on
Windows. If audio playback is unavailable, the timer falls back to different
numbers of terminal bells for work and break notifications.

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
