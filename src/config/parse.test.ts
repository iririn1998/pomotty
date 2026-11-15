import { describe, expect, test } from 'vitest';
import { parseConfig } from './parse.ts';

const PATH = '/home/u/.config/pomotty/config.json',
  /** 設定ファイルの内容を解析します。 */
  parse = (value: unknown): ReturnType<typeof parseConfig> =>
    parseConfig(JSON.stringify(value), PATH),
  /** 設定ファイルの内容が不正なときの診断です。 */
  invalid = (detail: string): ReturnType<typeof parseConfig> => ({
    kind: 'error',
    message: `Error: Invalid config file "${PATH}": ${detail}\n`,
  });

describe('正しい設定', () => {
  test('空のオブジェクトを受理する', () => {
    expect(parse({})).toEqual({ config: { presets: new Map(), values: {} }, kind: 'ok' });
  });

  test('すべての項目を読み取る', () => {
    expect(
      parse({
        $schema: 'https://example.com/schema.json',
        break: 5,
        defaultPreset: 'focus',
        loop: 4,
        presets: { focus: { break: 8, work: 40 }, short: {} },
        work: 25,
      }),
    ).toEqual({
      config: {
        defaultPreset: 'focus',
        presets: new Map([
          ['focus', { break: 8, work: 40 }],
          ['short', {}],
        ]),
        values: { break: 5, loop: 4, work: 25 },
      },
      kind: 'ok',
    });
  });

  test('書かなかった項目はキー自体を持たない', () => {
    const result = parse({ presets: { focus: { work: 40 } }, work: 25 });

    expect(result).toStrictEqual({
      config: { presets: new Map([['focus', { work: 40 }]]), values: { work: 25 } },
      kind: 'ok',
    });
  });

  test('defaultPresetに組み込みのプリセットを指定できる', () => {
    expect(parse({ defaultPreset: 'deep' })).toMatchObject({
      config: { defaultPreset: 'deep' },
      kind: 'ok',
    });
  });

  test('先頭のBOMを取り除く', () => {
    expect(parseConfig('﻿{"work": 30}', PATH)).toMatchObject({
      config: { values: { work: 30 } },
      kind: 'ok',
    });
  });

  test.each([1, 1440])('時間の境界値%iを受理する', (minutes) => {
    expect(parse({ break: minutes, work: minutes })).toMatchObject({ kind: 'ok' });
  });

  test('繰り返し回数の最大値を受理する', () => {
    expect(parse({ loop: Number.MAX_SAFE_INTEGER })).toMatchObject({ kind: 'ok' });
  });
});

describe('不正な設定', () => {
  test('JSONとして解析できなければエラーにする', () => {
    const result = parseConfig('{"work": 30,}', PATH);

    expect(result.kind).toBe('error');
    expect(result).toHaveProperty(
      'message',
      expect.stringMatching(/^Error: Invalid config file ".+": Invalid JSON \(.+\)\.\n$/u),
    );
  });

  test.each([[[]], [null], [1], ['text']])('トップレベルが%jならエラーにする', (value) => {
    expect(parse(value)).toEqual(invalid('The top level must be an object.'));
  });

  test('未知のキーをエラーにする', () => {
    expect(parse({ wrok: 25 })).toEqual(invalid('Unknown key "wrok".'));
  });

  test('未知のキーに含まれる制御文字をエスケープする', () => {
    expect(parse({ 'a\u001B[31m': 1 })).toEqual(invalid(String.raw`Unknown key "a\x1B[31m".`));
  });

  test.each([
    { key: 'work', value: 0 },
    { key: 'work', value: 1441 },
    { key: 'break', value: 1.5 },
    { key: 'break', value: '5' },
    { key: 'work', value: null },
  ])('$keyに$valueを指定するとエラーにする', ({ key, value }) => {
    expect(parse({ [key]: value })).toEqual(invalid(`${key} must be an integer from 1 to 1440.`));
  });

  test.each([0, -1, 2.5, Number.MAX_SAFE_INTEGER + 1, '3'])(
    'loopに%jを指定するとエラーにする',
    (value) => {
      expect(parse({ loop: value })).toEqual(
        invalid(`loop must be an integer from 1 to ${Number.MAX_SAFE_INTEGER}.`),
      );
    },
  );

  test.each([[[]], [null], ['deep']])('presetsが%jならエラーにする', (value) => {
    expect(parse({ presets: value })).toEqual(invalid('presets must be an object.'));
  });

  test.each(['', 'a b', '-x', '__proto__', 'a'.repeat(33)])(
    'プリセット名%jをエラーにする',
    (name) => {
      expect(parseConfig(`{"presets": {${JSON.stringify(name)}: {}}}`, PATH)).toMatchObject({
        kind: 'error',
        message: expect.stringContaining('Invalid preset name'),
      });
    },
  );

  test.each([[[]], [null], [25]])('プリセットの値が%jならエラーにする', (value) => {
    expect(parse({ presets: { focus: value } })).toEqual(
      invalid('presets.focus must be an object.'),
    );
  });

  test('プリセットの未知のキーをエラーにする', () => {
    expect(parse({ presets: { focus: { defaultPreset: 'x' } } })).toEqual(
      invalid('Unknown key "defaultPreset" in presets.focus.'),
    );
  });

  test('プリセットの範囲外の値をエラーにする', () => {
    expect(parse({ presets: { focus: { work: 2000 } } })).toEqual(
      invalid('presets.focus.work must be an integer from 1 to 1440.'),
    );
  });

  test('文字列でないdefaultPresetをエラーにする', () => {
    expect(parse({ defaultPreset: 1 })).toEqual(invalid('defaultPreset must be a string.'));
  });

  test('存在しないdefaultPresetをエラーにする', () => {
    expect(parse({ defaultPreset: 'nope', presets: { focus: {} } })).toEqual(
      invalid('defaultPreset refers to an unknown preset "nope".'),
    );
  });
});
