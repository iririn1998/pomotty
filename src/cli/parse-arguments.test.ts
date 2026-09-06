import { DEFAULT_BREAK_DURATION_MINUTES, DEFAULT_WORK_DURATION_MINUTES } from '@/timer/timer.ts';
import { describe, expect, test } from 'vitest';
import { parseCliArguments } from './parse-arguments.ts';

const DEFAULT_TIMER_OPTIONS = {
    breakDurationMinutes: DEFAULT_BREAK_DURATION_MINUTES,
    kind: 'run',
    workDurationMinutes: DEFAULT_WORK_DURATION_MINUTES,
  } as const,
  LONG_OPTION_LENGTH = 300,
  MAXIMUM_DURATION_MINUTES = 1440,
  MINIMUM_DURATION_MINUTES = 1,
  TRUNCATED_OPTION_LENGTH = 158;

test('オプションなしでは作業15分・休憩5分を返す', () => {
  expect(parseCliArguments([])).toEqual(DEFAULT_TIMER_OPTIONS);
});

test.each([
  {
    arguments_: ['--work', '30', '--break', '10'],
    expected: { breakDurationMinutes: 10, kind: 'run', workDurationMinutes: 30 },
    name: '分離形式',
  },
  {
    arguments_: ['--break=20', '--work=50'],
    expected: { breakDurationMinutes: 20, kind: 'run', workDurationMinutes: 50 },
    name: 'イコール形式',
  },
  {
    arguments_: ['--work', '45'],
    expected: {
      breakDurationMinutes: DEFAULT_BREAK_DURATION_MINUTES,
      kind: 'run',
      workDurationMinutes: 45,
    },
    name: '作業時間だけ指定',
  },
  {
    arguments_: ['--break', '15'],
    expected: {
      breakDurationMinutes: 15,
      kind: 'run',
      workDurationMinutes: DEFAULT_WORK_DURATION_MINUTES,
    },
    name: '休憩時間だけ指定',
  },
])('$nameで時間を指定できる', ({ arguments_, expected }) => {
  expect(parseCliArguments(arguments_)).toEqual(expected);
});

describe.each(['--work', '--break'])('%s', (option) => {
  test.each([MINIMUM_DURATION_MINUTES, MAXIMUM_DURATION_MINUTES])(
    '%i分を受理する',
    (durationMinutes) => {
      expect(parseCliArguments([option, String(durationMinutes)])).toMatchObject({
        kind: 'run',
      });
    },
  );

  test.each(['0', '1441', '1.5', '01', '+1', '1e2', ''])('%j分を拒否する', (value) => {
    expect(parseCliArguments([option, value])).toEqual({
      kind: 'error',
      message: `Error: ${option} requires an integer from 1 to 1440.\n`,
    });
  });

  test('値がない場合は拒否する', () => {
    expect(parseCliArguments([option])).toEqual({
      kind: 'error',
      message: `Error: ${option} requires an integer from 1 to 1440.\n`,
    });
  });

  test('重複指定を拒否する', () => {
    expect(parseCliArguments([option, '10', `${option}=20`])).toEqual({
      kind: 'error',
      message: `Error: ${option} may only be specified once.\n`,
    });
  });
});

test('未知のオプションを拒否する', () => {
  expect(parseCliArguments(['--unknown'])).toEqual({
    kind: 'error',
    message: 'Error: Unknown option: "--unknown"\n',
  });
});

test.each([
  { escaped: String.raw`\x0AFORGED LOG LINE`, name: '改行', raw: '\nFORGED LOG LINE' },
  { escaped: String.raw`\x1B[31m`, name: 'ESC', raw: '\u001B[31m' },
  { escaped: String.raw`\u{202E}`, name: 'RLO', raw: '\u202E' },
  { escaped: String.raw`\"`, name: '二重引用符', raw: '"' },
])('未知のオプションに含まれる$nameをエスケープする', ({ escaped, raw }) => {
  expect(parseCliArguments([`--unknown${raw}`])).toEqual({
    kind: 'error',
    message: `Error: Unknown option: "--unknown${escaped}"\n`,
  });
});

test('未知のオプションを160コードポイントで切り詰める', () => {
  expect(parseCliArguments([`--${'A'.repeat(LONG_OPTION_LENGTH)}`])).toEqual({
    kind: 'error',
    message: `Error: Unknown option: "--${'A'.repeat(TRUNCATED_OPTION_LENGTH)}…"\n`,
  });
});

test.each(['--help', '-h'])('%sでヘルプ表示を選ぶ', (option) => {
  expect(parseCliArguments([option])).toEqual({ kind: 'help' });
});

test('ヘルプは他の不正な引数より優先する', () => {
  expect(parseCliArguments(['--unknown', '--help'])).toEqual({ kind: 'help' });
});
