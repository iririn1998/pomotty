import { DEFAULT_BREAK_DURATION_MS, DEFAULT_WORK_DURATION_MS } from './timer.ts';
import { expect, test } from 'vitest';
import { LOGO } from './constants/logo.ts';
import type { TimerPhase } from './timer.ts';
import { runCli } from './cli/run.ts';

type CliResult = {
  readonly durations: readonly number[];
  readonly output: string;
  readonly sounds: readonly TimerPhase[];
};

const help =
    'Pomotty CLI\n\nUsage: pomotty [OPTIONS]\n\nOptions:\n  -h, --help\n          Print help\n',
  runCliFor = (arguments_: readonly string[] = []): Promise<CliResult> => {
    const durations: number[] = [],
      sounds: TimerPhase[] = [];
    let output = '';

    return runCli({
      arguments_,
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
    }).then(() => ({ durations, output, sounds }));
  };

test('オプションなしで25分の作業と5分の休憩を1回実行する', async () => {
  const result = await runCliFor();

  expect(result).toEqual({
    durations: [DEFAULT_WORK_DURATION_MS, DEFAULT_BREAK_DURATION_MS],
    output: [
      `${LOGO}\n`,
      '🍅 作業を開始します（25分）\n',
      '✅ 作業が完了しました。\n',
      '☕ 休憩を開始します（5分）\n',
      '✅ 休憩が完了しました。\n',
      '🎉 1セット完了しました。\n',
    ].join(''),
    sounds: ['work', 'break'],
  });
});

test.each(['--help', '-h'])('%sでヘルプを表示してタイマーを開始しない', async (option) => {
  const result = await runCliFor([option]);

  expect(result).toEqual({ durations: [], output: help, sounds: [] });
});

test('未対応のオプションではタイマーを開始しない', async () => {
  const result = await runCliFor(['--unknown']);

  expect(result).toEqual({
    durations: [],
    output: `${LOGO}\n`,
    sounds: [],
  });
});
