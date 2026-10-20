import { DEFAULT_BREAK_DURATION_MINUTES, DEFAULT_WORK_DURATION_MINUTES } from '#src/timer/timer.ts';
import { describe, expect, test } from 'vitest';
import { parseCliArguments } from './parse-arguments.ts';

const DEFAULT_TIMER_OPTIONS = {
    breakDurationMinutes: DEFAULT_BREAK_DURATION_MINUTES,
    kind: 'run',
    loopCount: 3,
    workDurationMinutes: DEFAULT_WORK_DURATION_MINUTES,
  } as const,
  LONG_OPTION_LENGTH = 300,
  MAXIMUM_DURATION_MINUTES = 1440,
  MINIMUM_DURATION_MINUTES = 1,
  TRUNCATED_OPTION_LENGTH = 158;

test('オプションなしでは作業15分・休憩5分・3回を返す', () => {
  expect(parseCliArguments([])).toEqual(DEFAULT_TIMER_OPTIONS);
});

test.each([
  {
    arguments_: ['--work', '30', '--break', '10'],
    expected: { breakDurationMinutes: 10, kind: 'run', loopCount: 3, workDurationMinutes: 30 },
    name: '分離形式',
  },
  {
    arguments_: ['--break=20', '--work=50'],
    expected: { breakDurationMinutes: 20, kind: 'run', loopCount: 3, workDurationMinutes: 50 },
    name: 'イコール形式',
  },
  {
    arguments_: ['--work', '45'],
    expected: {
      breakDurationMinutes: DEFAULT_BREAK_DURATION_MINUTES,
      kind: 'run',
      loopCount: 3,
      workDurationMinutes: 45,
    },
    name: '作業時間だけ指定',
  },
  {
    arguments_: ['--break', '15'],
    expected: {
      breakDurationMinutes: 15,
      kind: 'run',
      loopCount: 3,
      workDurationMinutes: DEFAULT_WORK_DURATION_MINUTES,
    },
    name: '休憩時間だけ指定',
  },
])('$nameで時間を指定できる', ({ arguments_, expected }) => {
  expect(parseCliArguments(arguments_)).toEqual(expected);
});

test.each([
  { arguments_: ['--loop', '1'], loopCount: 1 },
  { arguments_: ['--loop=5'], loopCount: 5 },
  { arguments_: ['--loop', String(Number.MAX_SAFE_INTEGER)], loopCount: Number.MAX_SAFE_INTEGER },
])('繰り返し回数を受理する: $arguments_', ({ arguments_, loopCount }) => {
  expect(parseCliArguments(arguments_)).toEqual({
    breakDurationMinutes: DEFAULT_BREAK_DURATION_MINUTES,
    kind: 'run',
    loopCount,
    workDurationMinutes: DEFAULT_WORK_DURATION_MINUTES,
  });
});

test.each([
  [],
  [''],
  ['0'],
  ['-1'],
  ['1.5'],
  ['01'],
  ['+1'],
  ['1e2'],
  [' 2'],
  ['Infinity'],
  ['9007199254740992'],
  ['--work'],
])('不正な繰り返し回数を拒否する: %j', (...values) => {
  expect(parseCliArguments(['--loop', ...values])).toEqual({
    kind: 'error',
    message: `Error: --loop requires an integer from 1 to ${Number.MAX_SAFE_INTEGER}.\n`,
  });
});

test('繰り返し回数の重複指定を拒否する', () => {
  expect(parseCliArguments(['--loop', '2', '--loop=3'])).toEqual({
    kind: 'error',
    message: 'Error: --loop may only be specified once.\n',
  });
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

test('作業時間、休憩時間、繰り返し回数を同時に指定できる', () => {
  expect(parseCliArguments(['--loop=4', '--break', '7', '--work=40'])).toEqual({
    breakDurationMinutes: 7,
    kind: 'run',
    loopCount: 4,
    workDurationMinutes: 40,
  });
});

describe.each(['--work', '--break'])('%sの数値文法', (option) => {
  test.each(['２５', ' 25', '25 ', '0x19', '.5', '1.', 'NaN', 'Infinity', '-1', '10000', '025'])(
    '%j分を拒否する',
    (value) => {
      expect(parseCliArguments([option, value])).toEqual({
        kind: 'error',
        message: `Error: ${option} requires an integer from 1 to 1440.\n`,
      });
    },
  );

  test.each([
    { name: '空の値', value: '' },
    { name: '負数', value: '-1' },
    { name: '2つ目のイコール', value: '10=20' },
  ])('イコール形式の$nameを拒否する', ({ value }) => {
    expect(parseCliArguments([`${option}=${value}`])).toEqual({
      kind: 'error',
      message: `Error: ${option} requires an integer from 1 to 1440.\n`,
    });
  });

  test('分離形式では次の引数がオプション名でも値として扱う', () => {
    expect(parseCliArguments([option, '--loop', '2'])).toEqual({
      kind: 'error',
      message: `Error: ${option} requires an integer from 1 to 1440.\n`,
    });
  });
});

test('値として消費した引数はオプションとして解析しない', () => {
  expect(parseCliArguments(['--loop', '20', '--work', '30'])).toEqual({
    breakDurationMinutes: DEFAULT_BREAK_DURATION_MINUTES,
    kind: 'run',
    loopCount: 20,
    workDurationMinutes: 30,
  });
});

test('値のない最後のオプションを拒否する', () => {
  expect(parseCliArguments(['--work', '10', '--break'])).toEqual({
    kind: 'error',
    message: 'Error: --break requires an integer from 1 to 1440.\n',
  });
});

test.each([
  { arguments_: ['--loop', '99999999999999999999'], name: '安全な整数を超える桁数' },
  { arguments_: ['--loop', '１'], name: '全角数字' },
  { arguments_: ['--loop', '0x1'], name: '16進数表記' },
  { arguments_: ['--loop='], name: 'イコール形式の空の値' },
])('繰り返し回数の$nameを拒否する', ({ arguments_ }) => {
  expect(parseCliArguments(arguments_)).toEqual({
    kind: 'error',
    message: `Error: --loop requires an integer from 1 to ${Number.MAX_SAFE_INTEGER}.\n`,
  });
});

test('作業時間と休憩時間は4桁目までを先に文法で判定し、1440を超える値を範囲で拒否する', () => {
  expect(parseCliArguments(['--work', '9999'])).toMatchObject({ kind: 'error' });
  expect(parseCliArguments(['--break', '1439'])).toMatchObject({
    breakDurationMinutes: 1439,
    kind: 'run',
  });
});

test.each([
  { arguments_: ['--work', '10', '--work', 'abc'], name: '2回目の値が不正' },
  { arguments_: ['--work=10', '--work=10'], name: '同じ値' },
])('重複指定は$nameでも重複として拒否する', ({ arguments_ }) => {
  expect(parseCliArguments(arguments_)).toEqual({
    kind: 'error',
    message: 'Error: --work may only be specified once.\n',
  });
});

test('値の検証は重複の検査より先に最初の指定で行う', () => {
  expect(parseCliArguments(['--work', 'abc', '--work', '10'])).toEqual({
    kind: 'error',
    message: 'Error: --work requires an integer from 1 to 1440.\n',
  });
});

test('最初に見つかったエラーだけを返す', () => {
  expect(parseCliArguments(['--unknown', '--work', '0'])).toEqual({
    kind: 'error',
    message: 'Error: Unknown option: "--unknown"\n',
  });
  expect(parseCliArguments(['--work', '0', '--unknown'])).toEqual({
    kind: 'error',
    message: 'Error: --work requires an integer from 1 to 1440.\n',
  });
});

test.each([
  { argument: '--', name: '単独の--' },
  { argument: 'value', name: '位置引数' },
  { argument: '-', name: '単独の-' },
  { argument: '--Work', name: '大文字を含むオプション名' },
  { argument: '-w', name: '定義していない短縮形' },
  { argument: '-hv', name: '結合した短縮形' },
  { argument: '--help=yes', name: '値を付けたヘルプ' },
  { argument: '--version', name: '--version' },
  { argument: '', name: '空文字列' },
])('$nameを未知のオプションとして拒否する', ({ argument }) => {
  expect(parseCliArguments([argument])).toEqual({
    kind: 'error',
    message: `Error: Unknown option: ${JSON.stringify(argument)}\n`,
  });
});

test('未知のオプションのエラーには値を含む引数全体を表示する', () => {
  expect(parseCliArguments(['--unknown=1'])).toEqual({
    kind: 'error',
    message: 'Error: Unknown option: "--unknown=1"\n',
  });
});

test('位置引数は直前のオプションの値として消費されなければ拒否する', () => {
  expect(parseCliArguments(['--work=10', '20'])).toEqual({
    kind: 'error',
    message: 'Error: Unknown option: "20"\n',
  });
});

describe('ヘルプの判定', () => {
  test('引数全体が--helpまたは-hと一致するものだけをヘルプとする', () => {
    expect(parseCliArguments(['--work=-h'])).toEqual({
      kind: 'error',
      message: 'Error: --work requires an integer from 1 to 1440.\n',
    });
  });

  test('値の位置にある-hもヘルプとして扱う', () => {
    expect(parseCliArguments(['--work', '-h'])).toEqual({ kind: 'help' });
  });

  test('重複したヘルプも受理する', () => {
    expect(parseCliArguments(['-h', '--help', '-h'])).toEqual({ kind: 'help' });
  });

  test('--の後のヘルプも受理する', () => {
    expect(parseCliArguments(['--', '--help'])).toEqual({ kind: 'help' });
  });

  test('重複や不正な値よりもヘルプを優先する', () => {
    expect(parseCliArguments(['--work', '0', '--work', '0', '--help'])).toEqual({ kind: 'help' });
  });
});
