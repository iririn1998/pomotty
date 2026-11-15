import { describe, expect, test } from 'vitest';
import { listPresets, resolveTimerValues } from './resolve.ts';
import type { Config } from './parse.ts';
import { EMPTY_CONFIG } from './load.ts';

const CONFIG: Config = {
  presets: new Map([
    ['deep', { work: 60 }],
    ['focus', { break: 8, work: 40 }],
  ]),
  values: { break: 6, loop: 5, work: 20 },
};

describe('resolveTimerValues', () => {
  test('何も指定しなければ組み込みの標準値を使う', () => {
    expect(resolveTimerValues({ config: EMPTY_CONFIG, overrides: {} })).toEqual({
      kind: 'ok',
      values: { break: 5, loop: 3, work: 25 },
    });
  });

  test('設定ファイルのトップレベルの値を使う', () => {
    expect(resolveTimerValues({ config: CONFIG, overrides: {} })).toEqual({
      kind: 'ok',
      values: { break: 6, loop: 5, work: 20 },
    });
  });

  test('組み込みのプリセットを使う', () => {
    expect(resolveTimerValues({ config: EMPTY_CONFIG, overrides: {}, preset: 'classic' })).toEqual({
      kind: 'ok',
      values: { break: 5, loop: 4, work: 25 },
    });
  });

  test('プリセットで省略した項目はトップレベルの値で補う', () => {
    expect(resolveTimerValues({ config: CONFIG, overrides: {}, preset: 'focus' })).toEqual({
      kind: 'ok',
      values: { break: 8, loop: 5, work: 40 },
    });
  });

  test('設定ファイルのプリセットは同名の組み込みを丸ごと置き換える', () => {
    expect(resolveTimerValues({ config: CONFIG, overrides: {}, preset: 'deep' })).toEqual({
      kind: 'ok',
      values: { break: 6, loop: 5, work: 60 },
    });
  });

  test('CLIの値はプリセットより優先する', () => {
    expect(resolveTimerValues({ config: CONFIG, overrides: { loop: 1 }, preset: 'focus' })).toEqual(
      { kind: 'ok', values: { break: 8, loop: 1, work: 40 } },
    );
  });

  test('CLIでプリセットを指定しなければdefaultPresetを使う', () => {
    expect(
      resolveTimerValues({ config: { ...CONFIG, defaultPreset: 'quick' }, overrides: {} }),
    ).toEqual({ kind: 'ok', values: { break: 3, loop: 3, work: 15 } });
  });

  test('CLIのプリセットはdefaultPresetより優先する', () => {
    expect(
      resolveTimerValues({
        config: { ...CONFIG, defaultPreset: 'quick' },
        overrides: {},
        preset: 'classic',
      }),
    ).toEqual({ kind: 'ok', values: { break: 5, loop: 4, work: 25 } });
  });

  test('存在しないプリセットをエラーにする', () => {
    expect(resolveTimerValues({ config: CONFIG, overrides: {}, preset: 'nope' })).toEqual({
      kind: 'error',
      message:
        'Error: Unknown preset: "nope". Run "pomotty --list-presets" to see available presets.\n',
    });
  });
});

describe('listPresets', () => {
  test('設定ファイルがなければ組み込みの3つを返す', () => {
    expect(listPresets(EMPTY_CONFIG)).toEqual([
      {
        isDefault: false,
        name: 'classic',
        source: 'built-in',
        values: { break: 5, loop: 4, work: 25 },
      },
      {
        isDefault: false,
        name: 'deep',
        source: 'built-in',
        values: { break: 10, loop: 2, work: 50 },
      },
      {
        isDefault: false,
        name: 'quick',
        source: 'built-in',
        values: { break: 3, loop: 3, work: 15 },
      },
    ]);
  });

  test('組み込み、設定ファイルの順に、補った値と定義元を返す', () => {
    expect(listPresets({ ...CONFIG, defaultPreset: 'focus' })).toEqual([
      {
        isDefault: false,
        name: 'classic',
        source: 'built-in',
        values: { break: 5, loop: 4, work: 25 },
      },
      {
        isDefault: false,
        name: 'deep',
        source: 'config-override',
        values: { break: 6, loop: 5, work: 60 },
      },
      {
        isDefault: false,
        name: 'quick',
        source: 'built-in',
        values: { break: 3, loop: 3, work: 15 },
      },
      { isDefault: true, name: 'focus', source: 'config', values: { break: 8, loop: 5, work: 40 } },
    ]);
  });
});
