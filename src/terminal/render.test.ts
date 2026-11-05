import { expect, test } from 'vitest';
import { COMPACT_LOGO, LOGO } from './constants.ts';
import type { OptionDefinition } from '#src/cli/types.ts';
import { createCliOutput } from './render.ts';

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
