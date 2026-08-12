import { expect, test } from 'vitest';
import { LOGO } from './constants/logo.ts';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const EXIT_CODE_SUCCESS = 0,
  cliPath = fileURLToPath(new URL('cli.ts', import.meta.url));

test('CLI起動時にロゴを標準出力へ表示する', () => {
  // oxlint-disable-next-line node/no-sync
  const result = spawnSync(process.execPath, [cliPath], {
    encoding: 'utf8',
  });

  expect(result.error).toBeUndefined();
  expect(result.status).toBe(EXIT_CODE_SUCCESS);
  expect(result.signal).toBeNull();
  expect(result.stderr).toBe('');
  expect(result.stdout).toBe(`${LOGO}\n`);
});
