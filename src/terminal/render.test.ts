import { expect, test } from 'vitest';
import { COMPACT_LOGO, LOGO } from './constants.ts';
import type { OptionDefinition } from '#src/cli/types.ts';
import { cellWidth } from './frame-line.ts';
import { createCliOutput } from './render.ts';
import process from 'node:process';

const help = [
    'Pomotty CLI',
    '',
    'Usage: pomotty [OPTIONS]',
    '',
    'Options:',
    '  -h, --help',
    '          Show help',
    '  --version',
    '          Show version',
    '',
  ].join('\n'),
  options = [
    {
      alias: '-h',
      description: 'Show help',
      name: '--help',
    },
    {
      description: 'Show version',
      name: '--version',
    },
  ] as const satisfies readonly OptionDefinition[],
  outputFor = (optionName = ''): string => createCliOutput({ optionName, options });

test.each(['--help', '-h', '--version'])(
  '%sを指定すると利用可能なオプションのヘルプを返す',
  (option) => {
    expect(outputFor(option)).toBe(help);
  },
);

test('オプションが指定されていないときはロゴを返す', () => {
  expect(outputFor()).toBe(`${LOGO}\n`);
});

test('登録されていないオプションが指定されたときはロゴを返す', () => {
  expect(outputFor('--unknown')).toBe(`${LOGO}\n`);
});

test.each([
  { columns: 67, expected: `${LOGO}\n` },
  { columns: undefined, expected: `${LOGO}\n` },
  { columns: 0, expected: `${LOGO}\n` },
  { columns: 66, expected: `${COMPACT_LOGO}\n` },
  { columns: 40, expected: `${COMPACT_LOGO}\n` },
])('端末が$columns列のときはロゴが収まるかで表示を切り替える', ({ columns, expected }) => {
  expect(createCliOutput({ columns, optionName: '', options })).toBe(expected);
});

test('端末が狭くてもヘルプはそのまま返す', () => {
  expect(createCliOutput({ columns: 20, optionName: '--help', options })).toBe(help);
});

test('値を取るオプションは値の表示名を付け、短縮形がなければロングオプションだけを表示する', () => {
  expect(
    createCliOutput({
      optionName: '--help',
      options: [
        { description: 'Work duration', name: '--work', valueName: '<minutes>' },
        { alias: '-h', description: 'Show help', name: '--help' },
      ],
    }),
  ).toBe(
    [
      'Pomotty CLI',
      '',
      'Usage: pomotty [OPTIONS]',
      '',
      'Options:',
      '  --work <minutes>',
      '          Work duration',
      '  -h, --help',
      '          Show help',
      '',
    ].join('\n'),
  );
});

test('値を取るオプションの名前を指定してもヘルプを返す', () => {
  expect(
    createCliOutput({
      optionName: '--work',
      options: [{ description: 'Work duration', name: '--work', valueName: '<minutes>' }],
    }),
  ).toContain('Pomotty CLI\n');
});

test('オプション名を省略した場合はプロセスの最初のCLI引数で判定する', () => {
  const originalArgv = process.argv;

  try {
    process.argv = ['node', 'pomotty', '-h'];
    expect(createCliOutput({ options })).toBe(help);

    process.argv = ['node', 'pomotty', '--unknown'];
    expect(createCliOutput({ options })).toBe(`${LOGO}\n`);
  } finally {
    process.argv = originalArgv;
  }
});

test('ロゴは最も長い行が端末幅より1セル狭く収まる場合だけ表示する', () => {
  const logoWidth = Math.max(...LOGO.split('\n').map((line) => cellWidth(line)));

  expect(createCliOutput({ columns: logoWidth + 1, optionName: '', options })).toBe(`${LOGO}\n`);
  expect(createCliOutput({ columns: logoWidth, optionName: '', options })).toBe(
    `${COMPACT_LOGO}\n`,
  );
});
