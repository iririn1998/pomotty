import { afterEach, expect, test } from 'vitest';
import { LOGO } from '@/constants/logo.ts';
import type { OptionDefinition } from '@/types/options.ts';
import { createCliOutput } from './create-output.ts';

const CLI_ARGV_START_INDEX = 0,
  CLI_OPTION_INDEX = 2,
  help = [
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
  originalArgv = [...process.argv],
  outputFor = (option?: string): string => {
    process.argv.splice(CLI_OPTION_INDEX);

    if (typeof option === 'string') {
      process.argv.push(option);
    }

    return createCliOutput({ options });
  };

afterEach(() => {
  process.argv.splice(CLI_ARGV_START_INDEX, process.argv.length, ...originalArgv);
});

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
