import { EMPTY_CONFIG, loadConfig, readConfigFileIfExists } from './load.ts';
import type { ConfigSelection, ReadConfigFile } from './load.ts';
import type { LoadConfigResult } from './parse.ts';
import { describe, expect, test } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const DEFAULT_PATH = '/config/pomotty/config.json',
  /** 読み込んだパスを記録し、決められた内容を返す読み込み処理を作ります。 */
  createReader = (
    files: Readonly<Record<string, string>>,
  ): { readonly reads: string[]; readonly readFile: ReadConfigFile } => {
    const reads: string[] = [];

    return {
      readFile: (filePath) => {
        reads.push(filePath);
        return Promise.resolve(files[filePath]);
      },
      reads,
    };
  },
  /** 設定ファイルを読み込みます。 */
  load = (
    selection: ConfigSelection,
    files: Readonly<Record<string, string>>,
  ): { readonly reads: readonly string[]; readonly result: Promise<LoadConfigResult> } => {
    const reader = createReader(files);

    return {
      reads: reader.reads,
      result: loadConfig({ defaultPath: DEFAULT_PATH, readFile: reader.readFile, selection }),
    };
  };

describe('loadConfig', () => {
  test('標準の場所のファイルを読む', async () => {
    const { reads, result } = load({ kind: 'default' }, { [DEFAULT_PATH]: '{"work": 30}' });

    await expect(result).resolves.toMatchObject({ config: { values: { work: 30 } }, kind: 'ok' });
    expect(reads).toEqual([DEFAULT_PATH]);
  });

  test('標準の場所にファイルがなければ空の設定を返す', async () => {
    await expect(load({ kind: 'default' }, {}).result).resolves.toEqual({
      config: EMPTY_CONFIG,
      kind: 'ok',
    });
  });

  test('標準のパスがなければ何も読まない', async () => {
    const { readFile, reads } = createReader({}),
      result = loadConfig({ defaultPath: undefined, readFile, selection: { kind: 'default' } });

    await expect(result).resolves.toEqual({ config: EMPTY_CONFIG, kind: 'ok' });
    expect(reads).toEqual([]);
  });

  test('--configで指定したファイルを読み、標準の場所は読まない', async () => {
    const { reads, result } = load(
      { kind: 'file', path: 'my.json' },
      { [DEFAULT_PATH]: '{"work": 30}', 'my.json': '{"work": 45}' },
    );

    await expect(result).resolves.toMatchObject({ config: { values: { work: 45 } }, kind: 'ok' });
    expect(reads).toEqual(['my.json']);
  });

  test('--configで指定したファイルがなければエラーにする', async () => {
    await expect(load({ kind: 'file', path: 'missing.json' }, {}).result).resolves.toEqual({
      kind: 'error',
      message: 'Error: Config file not found: "missing.json"\n',
    });
  });

  test('--no-configでは何も読まない', async () => {
    const { reads, result } = load({ kind: 'none' }, { [DEFAULT_PATH]: '{"work": 30}' });

    await expect(result).resolves.toEqual({ config: EMPTY_CONFIG, kind: 'ok' });
    expect(reads).toEqual([]);
  });

  test('内容が不正ならエラーにする', async () => {
    await expect(
      load({ kind: 'default' }, { [DEFAULT_PATH]: '{"work": 0}' }).result,
    ).resolves.toEqual({
      kind: 'error',
      message: `Error: Invalid config file "${DEFAULT_PATH}": work must be an integer from 1 to 1440.\n`,
    });
  });

  test.each([
    { error: Object.assign(new Error('denied'), { code: 'EACCES' }), expected: 'EACCES' },
    { error: new Error('broken'), expected: 'broken' },
    { error: 'string', expected: 'unknown error' },
  ])('読み込みの失敗をエラーにする: $expected', async ({ error, expected }) => {
    await expect(
      loadConfig({
        defaultPath: DEFAULT_PATH,
        readFile: () => Promise.reject(error),
        selection: { kind: 'default' },
      }),
    ).resolves.toEqual({
      kind: 'error',
      message: `Error: Cannot read config file "${DEFAULT_PATH}" ("${expected}").\n`,
    });
  });
});

describe('readConfigFileIfExists', () => {
  test('ファイルの内容を返し、存在しなければundefinedを返す', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'pomotty-config-'));

    try {
      const filePath = path.join(directory, 'config.json');

      await writeFile(filePath, '{"work": 30}');
      await expect(readConfigFileIfExists(filePath)).resolves.toBe('{"work": 30}');
      await expect(
        readConfigFileIfExists(path.join(directory, 'missing.json')),
      ).resolves.toBeUndefined();
      await expect(
        readConfigFileIfExists(path.join(filePath, 'child.json')),
      ).resolves.toBeUndefined();
      await expect(readConfigFileIfExists(directory)).rejects.toThrow();
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });
});
