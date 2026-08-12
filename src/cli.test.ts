import { expect, test } from 'vitest';
import { LOGO } from './constants/logo.ts';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const cliPath = fileURLToPath(new URL('cli.ts', import.meta.url)),
  execFileAsync = promisify(execFile);

test('CLI起動時にロゴを標準出力へ表示する', () =>
  expect(
    execFileAsync(process.execPath, [cliPath], {
      encoding: 'utf8',
    }),
  ).resolves.toStrictEqual({
    stderr: '',
    stdout: `${LOGO}\n`,
  }));
