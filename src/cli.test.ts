import { expect, test } from 'vitest';
import { LOGO } from './constants/logo.ts';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const cliPath = fileURLToPath(new URL('cli.ts', import.meta.url)),
  execFileAsync = promisify(execFile),
  help =
    'Pomotty CLI\n\nUsage: pomotty [OPTIONS]\n\nOptions:\n  -h, --help\n          Print help\n';

test('CLI起動時にロゴを標準出力へ表示する', () =>
  expect(
    execFileAsync(process.execPath, [cliPath], {
      encoding: 'utf8',
    }),
  ).resolves.toStrictEqual({
    stderr: '',
    stdout: `${LOGO}\n`,
  }));

test('--helpでオプションの説明を表示する', () =>
  expect(
    execFileAsync(process.execPath, [cliPath, '--help'], {
      encoding: 'utf8',
    }),
  ).resolves.toStrictEqual({
    stderr: '',
    stdout: help,
  }));

test('-hで--helpと同じオプションの説明を表示する', () =>
  expect(
    execFileAsync(process.execPath, [cliPath, '-h'], {
      encoding: 'utf8',
    }),
  ).resolves.toStrictEqual({
    stderr: '',
    stdout: help,
  }));
