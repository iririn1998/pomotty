import { expect, test } from 'vitest';
import { EMPTY_CONFIG } from '#src/config/load.ts';
import { formatPresetList } from './list-presets.ts';
import { listPresets } from '#src/config/resolve.ts';

test('組み込みのプリセットを列をそろえて表示する', () => {
  expect(formatPresetList(listPresets(EMPTY_CONFIG))).toBe(
    [
      '  classic  work 25  break 5   loop 4  built-in',
      '  deep     work 50  break 10  loop 2  built-in',
      '  quick    work 15  break 3   loop 3  built-in',
      '',
    ].join('\n'),
  );
});

test('既定のプリセットに印を付け、定義元を表示する', () => {
  const entries = listPresets({
    defaultPreset: 'deep',
    presets: new Map([
      ['deep', { break: 15, work: 90 }],
      ['writing', { loop: 12 }],
    ]),
    values: {},
  });

  expect(formatPresetList(entries)).toBe(
    [
      '  classic  work 25  break 5   loop 4   built-in',
      '* deep     work 90  break 15  loop 3   config (overrides built-in)',
      '  quick    work 15  break 3   loop 3   built-in',
      '  writing  work 15  break 5   loop 12  config',
      '',
      '* default preset',
      '',
    ].join('\n'),
  );
});
