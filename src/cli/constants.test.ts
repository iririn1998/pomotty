import { expect, test } from 'vitest';
import { VERSION } from './constants.ts';
import { readFile } from 'node:fs/promises';

test('VERSIONはpackage.jsonのバージョンと一致する', async () => {
  const packageJson: unknown = JSON.parse(
    await readFile(new URL('../../package.json', import.meta.url), 'utf8'),
  );

  expect(packageJson).toMatchObject({ version: VERSION });
});
