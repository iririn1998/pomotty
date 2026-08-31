import { DEFAULT_BREAK_DURATION_MS, DEFAULT_WORK_DURATION_MS } from '@/timer/timer.ts';
import { expect, test } from 'vitest';
import { LOGO } from '@/terminal/constants.ts';
import type { TimerPhase } from '@/timer/timer.ts';
import { runCli } from './run.ts';

type CliResult = {
  readonly confirmationCount: number;
  readonly durations: readonly number[];
  readonly output: string;
  readonly sounds: readonly TimerPhase[];
};

const COUNT_INCREMENT = 1,
  help =
    'Pomotty CLI\n\nUsage: pomotty [OPTIONS]\n\nOptions:\n  -h, --help\n          Print help\n',
  runCliFor = (arguments_: readonly string[] = [], confirmed = true): Promise<CliResult> => {
    const durations: number[] = [],
      sounds: TimerPhase[] = [];
    let confirmationCount = 0,
      output = '';

    return runCli({
      arguments_,
      confirmStart: () => {
        confirmationCount += COUNT_INCREMENT;
        return Promise.resolve(confirmed);
      },
      playSound: (phase) => {
        sounds.push(phase);
      },
      wait: (durationMs) => {
        durations.push(durationMs);
        return Promise.resolve();
      },
      writeOutput: (value) => {
        output += value;
      },
    }).then(() => ({ confirmationCount, durations, output, sounds }));
  };

test('オプションなしで25分の作業と5分の休憩を1回実行する', async () => {
  const result = await runCliFor();

  expect(result).toEqual({
    confirmationCount: 1,
    durations: [DEFAULT_WORK_DURATION_MS, DEFAULT_BREAK_DURATION_MS],
    output: [
      `${LOGO}\n`,
      '🍅 Work started (25 min)\n',
      '✅ Work complete.\n',
      '☕ Break started (5 min)\n',
      '✅ Break complete.\n',
      '🎉 Pomodoro complete.\n',
    ].join(''),
    sounds: ['work', 'break'],
  });
});

test.each(['--help', '-h'])('%sでヘルプを表示してタイマーを開始しない', async (option) => {
  const result = await runCliFor([option]);

  expect(result).toEqual({
    confirmationCount: 0,
    durations: [],
    output: help,
    sounds: [],
  });
});

test('未対応のオプションではタイマーを開始しない', async () => {
  const result = await runCliFor(['--unknown']);

  expect(result).toEqual({
    confirmationCount: 0,
    durations: [],
    output: `${LOGO}\n`,
    sounds: [],
  });
});

test('NGを選択するとタイマーを開始しない', async () => {
  const result = await runCliFor([], false);

  expect(result).toEqual({
    confirmationCount: 1,
    durations: [],
    output: `${LOGO}\n⏹️ Work was not started.\n`,
    sounds: [],
  });
});
