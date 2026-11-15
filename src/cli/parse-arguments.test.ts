import { describe, expect, test } from 'vitest';
import { parseCliArguments } from './parse-arguments.ts';

const DEFAULT_CONFIG = { kind: 'default' } as const,
  LONG_OPTION_LENGTH = 300,
  MAXIMUM_DURATION_MINUTES = 1440,
  MINIMUM_DURATION_MINUTES = 1,
  TRUNCATED_OPTION_LENGTH = 158,
  /** 指定した値だけを持つタイマー起動の解析結果を作ります。 */
  runWith = (overrides: object, extra: object = {}): object => ({
    config: DEFAULT_CONFIG,
    kind: 'run',
    overrides,
    ...extra,
  });

test('オプションなしでは何も上書きせず、標準の設定ファイルを読む指定を返す', () => {
  expect(parseCliArguments([])).toEqual(runWith({}));
});

test.each([
  {
    arguments_: ['--work', '30', '--break', '10'],
    expected: runWith({ break: 10, work: 30 }),
    name: '分離形式',
  },
  {
    arguments_: ['--break=20', '--work=50'],
    expected: runWith({ break: 20, work: 50 }),
    name: 'イコール形式',
  },
  {
    arguments_: ['--work', '45'],
    expected: runWith({ work: 45 }),
    name: '作業時間だけ指定',
  },
  {
    arguments_: ['--break', '15'],
    expected: runWith({ break: 15 }),
    name: '休憩時間だけ指定',
  },
])('$nameで時間を指定できる', ({ arguments_, expected }) => {
  expect(parseCliArguments(arguments_)).toEqual(expected);
});

test('指定しない項目は上書きのキー自体を持たない', () => {
  expect(parseCliArguments(['--work', '45'])).toStrictEqual(runWith({ work: 45 }));
});

test.each([
  { arguments_: ['--loop', '1'], loopCount: 1 },
  { arguments_: ['--loop=5'], loopCount: 5 },
  { arguments_: ['--loop', String(Number.MAX_SAFE_INTEGER)], loopCount: Number.MAX_SAFE_INTEGER },
])('繰り返し回数を受理する: $arguments_', ({ arguments_, loopCount }) => {
  expect(parseCliArguments(arguments_)).toEqual(runWith({ loop: loopCount }));
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

describe('--preset', () => {
  test.each([['--preset', 'deep'], ['--preset=deep'], ['-p', 'deep'], ['-p=deep']])(
    '%jでプリセット名を受け取る',
    (...arguments_) => {
      expect(parseCliArguments(arguments_)).toEqual(runWith({}, { preset: 'deep' }));
    },
  );

  test('プリセットとCLIの値を組み合わせられる', () => {
    expect(parseCliArguments(['-p', 'deep', '--loop', '5'])).toEqual(
      runWith({ loop: 5 }, { preset: 'deep' }),
    );
  });

  test.each([[], [''], ['--work'], ['-x'], ['a b'], ['a'.repeat(33)], ['ねこ']])(
    '不正なプリセット名を拒否する: %j',
    (...values) => {
      expect(parseCliArguments(['--preset', ...values])).toEqual({
        kind: 'error',
        message:
          'Error: --preset requires a preset name (letters, digits, "-" or "_", up to 32 characters).\n',
      });
    },
  );

  test.each([
    ['--preset', 'a', '--preset', 'b'],
    ['-p', 'a', '--preset=b'],
  ])('短縮形を含む重複指定を拒否する: %j', (...arguments_) => {
    expect(parseCliArguments(arguments_)).toEqual({
      kind: 'error',
      message: 'Error: --preset may only be specified once.\n',
    });
  });
});

describe('--config と --no-config', () => {
  test.each([
    [['--config', 'my.json'], 'my.json'],
    [[String.raw`--config=C:\a b\c.json`], String.raw`C:\a b\c.json`],
    [['--config=a=b.json'], 'a=b.json'],
  ])('%jで指定したファイルを読む指定を返す', (arguments_, path) => {
    expect(parseCliArguments(arguments_)).toEqual({
      config: { kind: 'file', path },
      kind: 'run',
      overrides: {},
    });
  });

  test.each([[['--config']], [['--config', '']], [['--config=']]])(
    'パスがない場合は拒否する: %j',
    (arguments_) => {
      expect(parseCliArguments(arguments_)).toEqual({
        kind: 'error',
        message: 'Error: --config requires a file path.\n',
      });
    },
  );

  test('--no-configで設定ファイルを読まない指定を返す', () => {
    expect(parseCliArguments(['--no-config', '--work', '10'])).toEqual({
      config: { kind: 'none' },
      kind: 'run',
      overrides: { work: 10 },
    });
  });

  test('--no-configに値を付けると拒否する', () => {
    expect(parseCliArguments(['--no-config=true'])).toEqual({
      kind: 'error',
      message: 'Error: --no-config does not take a value.\n',
    });
  });

  test.each([
    ['--config', 'a.json', '--config', 'b.json'],
    ['--no-config', '--no-config'],
  ])('重複指定を拒否する: %j', (...arguments_) => {
    expect(parseCliArguments(arguments_)).toMatchObject({
      kind: 'error',
      message: `Error: ${arguments_[0]} may only be specified once.\n`,
    });
  });

  test('--configと--no-configの同時指定を拒否する', () => {
    expect(parseCliArguments(['--no-config', '--config', 'a.json'])).toEqual({
      kind: 'error',
      message: 'Error: --config and --no-config cannot be used together.\n',
    });
  });
});

describe('--list-presets', () => {
  test('プリセット一覧の表示を選ぶ', () => {
    expect(parseCliArguments(['--list-presets'])).toEqual({
      config: DEFAULT_CONFIG,
      kind: 'list-presets',
    });
  });

  test('読む設定ファイルの指定と組み合わせられる', () => {
    expect(parseCliArguments(['--list-presets', '--config', 'a.json'])).toEqual({
      config: { kind: 'file', path: 'a.json' },
      kind: 'list-presets',
    });
    expect(parseCliArguments(['--no-config', '--list-presets'])).toEqual({
      config: { kind: 'none' },
      kind: 'list-presets',
    });
  });

  test.each([
    ['--work', '10'],
    ['--break', '10'],
    ['--loop', '2'],
    ['-p', 'deep'],
  ])('タイマーの値やプリセットとの組み合わせを拒否する: %j', (...arguments_) => {
    expect(parseCliArguments(['--list-presets', ...arguments_])).toEqual({
      kind: 'error',
      message:
        'Error: --list-presets cannot be combined with --work, --break, --loop, or --preset.\n',
    });
  });

  test('値を付けると拒否する', () => {
    expect(parseCliArguments(['--list-presets=all'])).toEqual({
      kind: 'error',
      message: 'Error: --list-presets does not take a value.\n',
    });
  });

  test('重複指定を拒否する', () => {
    expect(parseCliArguments(['--list-presets', '--list-presets'])).toEqual({
      kind: 'error',
      message: 'Error: --list-presets may only be specified once.\n',
    });
  });
});
