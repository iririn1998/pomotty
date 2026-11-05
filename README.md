# pomotty

English | [日本語](./README.ja.md)

A Pomodoro timer for the terminal, available on Node.js `^22.18.0 || >=24.11.0`.

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

Use `--loop` to set the number of work and break cycles. It defaults to 3 and
accepts whole numbers from 1 to 9007199254740991. The start confirmation appears
only once, and the timer exits after the final break finishes.

```shell
pomotty --loop 5
pomotty --work=25 --break=5 --loop=2
```

While the timer runs, the remaining time is shown in large digits and updated in
place. Below it are a progress bar for the current phase (elapsed time, percentage,
and total time) and a timeline showing the work and break progress of each cycle.

```text
  🍅 WORK                      Cycle 2 / 3

          ██████    ██  ██ ██████
          ██  ██ ██ ██  ██     ██
          ██████    ██████ ██████
          ██  ██ ██     ██ ██
          ██████        ██ ██████

  ━━━━━━━━━━━━━━━━────────────────────────
  6:18 elapsed      42%        15:00 total

  #1  ███████████████ █████  ✓
  #2  ██████▎········ ·····  ◀ now
  #3  ··············· ·····
      work 15:00      break 5:00

  [space] pause   [s] skip   [q] quit
```

Work is shown in red and breaks in green. Set `NO_COLOR` to a non-empty value to
disable colors. In narrow terminals, the timer switches to a compact view with only
the remaining time, percentage, and bar, or to a single line, and the startup logo
is replaced with a short title.

While the timer runs, you can use these keys:

| Key      | Action                                                                               |
| -------- | ------------------------------------------------------------------------------------ |
| `space`  | Pause or resume. Time does not pass while paused                                     |
| `s`      | Skip the current phase. No sound plays, and skipped work is not counted as completed |
| `q`      | Stop the timer and exit (exit code 0)                                                |
| `Ctrl+C` | Stop the timer and exit (exit code 130)                                              |

If the current phase has already reached its end time when you press a key, the
phase is completed first and the key then applies to the next phase. On `SIGTERM`
(143) or `SIGHUP` (129), the timer also restores the hidden cursor and the terminal
input mode before exiting. When standard input or output is not a terminal (for
example, a pipe or redirect), keys are not read and the timer prints one line when
each phase starts and finishes.

To see the available options, run:

```shell
pomotty --help
```

Different notification sounds play when work and break sessions end. Sound
playback uses `afplay` on macOS, `paplay` or `aplay` on Linux, and PowerShell on
Windows. If audio playback is unavailable, the timer falls back to different
numbers of terminal bells for work and break notifications.
Playback commands are resolved to absolute paths once at startup. On Linux, only
absolute directories in `PATH` are searched, and commands under the working
directory or `node_modules/.bin` are never used.

For development and npm publishing instructions, see the [development guide](./DEVELOPMENT.md).

## License

MIT
