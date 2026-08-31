import {
  DEFAULT_BREAK_DURATION_MS,
  DEFAULT_WORK_DURATION_MS,
  MILLISECONDS_PER_MINUTE,
} from '@/timer/timer.ts';
import { expect, test } from 'vitest';
import { LOGO } from '@/terminal/constants.ts';
import type { TimerPhase } from '@/timer/timer.ts';
import { runCli } from './run.ts';

type CliResult = {
  readonly confirmationCount: number;
  readonly durations: readonly number[];
  readonly errorOutput: string;
  readonly exitCode: number;
  readonly output: string;
  readonly sounds: readonly TimerPhase[];
};

const COUNT_INCREMENT = 1,
  EQUALS_BREAK_DURATION_MINUTES = 15,
  EQUALS_WORK_DURATION_MINUTES = 45,
  SEPARATED_BREAK_DURATION_MINUTES = 10,
  SEPARATED_WORK_DURATION_MINUTES = 30,
  SUCCESS_EXIT_CODE = 0,
  help =
    'Pomotty CLI\n\nUsage: pomotty [OPTIONS]\n\nOptions:\n  --work <minutes>\n          Work duration in minutes (1-1440, default: 15)\n  --break <minutes>\n          Break duration in minutes (1-1440, default: 5)\n  -h, --help\n          Print help\n',
  runCliFor = (arguments_: readonly string[] = [], confirmed = true): Promise<CliResult> => {
    const durations: number[] = [],
      sounds: TimerPhase[] = [];
    let confirmationCount = 0,
      errorOutput = '',
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
      writeError: (value) => {
        errorOutput += value;
      },
      writeOutput: (value) => {
        output += value;
      },
    }).then((exitCode) => ({
      confirmationCount,
      durations,
      errorOutput,
      exitCode,
      output,
      sounds,
    }));
  };

test('オプションなしで15分の作業と5分の休憩を1回実行する', async () => {
  const result = await runCliFor();

  expect(result).toEqual({
    confirmationCount: 1,
    durations: [DEFAULT_WORK_DURATION_MS, DEFAULT_BREAK_DURATION_MS],
    errorOutput: '',
    exitCode: 0,
    output: [
      `${LOGO}\n`,
      '🍅 Work started (15 min)\n',
      '✅ Work complete.\n',
      '☕ Break started (5 min)\n',
      '✅ Break complete.\n',
      '🎉 Pomodoro complete.\n',
    ].join(''),
    sounds: ['work', 'break'],
  });
});

test.each([
  {
    arguments_: ['--work', '30', '--break', '10'],
    durations: [
      SEPARATED_WORK_DURATION_MINUTES * MILLISECONDS_PER_MINUTE,
      SEPARATED_BREAK_DURATION_MINUTES * MILLISECONDS_PER_MINUTE,
    ],
    name: '分離形式',
  },
  {
    arguments_: ['--work=45', '--break=15'],
    durations: [
      EQUALS_WORK_DURATION_MINUTES * MILLISECONDS_PER_MINUTE,
      EQUALS_BREAK_DURATION_MINUTES * MILLISECONDS_PER_MINUTE,
    ],
    name: 'イコール形式',
  },
])('$nameで指定した時間をタイマーへ渡す', async ({ arguments_, durations }) => {
  const result = await runCliFor(arguments_);

  expect(result.durations).toEqual(durations);
  expect(result.errorOutput).toBe('');
  expect(result.exitCode).toBe(SUCCESS_EXIT_CODE);
});

test.each(['--help', '-h'])('%sでヘルプを表示してタイマーを開始しない', async (option) => {
  const result = await runCliFor([option]);

  expect(result).toEqual({
    confirmationCount: 0,
    durations: [],
    errorOutput: '',
    exitCode: 0,
    output: help,
    sounds: [],
  });
});

test('未知のオプションではエラー終了しタイマーを開始しない', async () => {
  const result = await runCliFor(['--unknown']);

  expect(result).toEqual({
    confirmationCount: 0,
    durations: [],
    errorOutput: 'Error: Unknown option: --unknown\n',
    exitCode: 2,
    output: '',
    sounds: [],
  });
});

test('NGを選択するとタイマーを開始しない', async () => {
  const result = await runCliFor([], false);

  expect(result).toEqual({
    confirmationCount: 1,
    durations: [],
    errorOutput: '',
    exitCode: 0,
    output: `${LOGO}\n⏹️ Work was not started.\n`,
    sounds: [],
  });
});
