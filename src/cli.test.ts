import { afterEach, expect, test } from 'vitest';
import { LOGO } from './constants/logo.ts';
import { runCli } from './cli/run.ts';

const CLI_ARGV_START_INDEX = 0,
  CLI_OPTION_INDEX = 2,
  help =
    'Pomotty CLI\n\nUsage: pomotty [OPTIONS]\n\nOptions:\n  -h, --help\n          Print help\n',
  originalArgv = [...process.argv],
  outputFor = (option?: string): string => {
    process.argv.splice(CLI_OPTION_INDEX);

    if (typeof option === 'string') {
      process.argv.push(option);
    }

    let output = '';

    runCli((value) => {
      output = value;
    });

    return output;
  };

afterEach(() => {
  process.argv.splice(CLI_ARGV_START_INDEX, process.argv.length, ...originalArgv);
});

test('CLI起動時にロゴを標準出力へ表示する', () => {
  expect(outputFor()).toBe(`${LOGO}\n`);
});

test.each(['--help', '-h'])('%sでヘルプを表示する', (option) => {
  expect(outputFor(option)).toBe(help);
});
