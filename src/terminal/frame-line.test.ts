import { cellWidth, isColorEnabled, stringifyFrameLine, truncateLine } from './frame-line.ts';
import { describe, expect, test } from 'vitest';

describe('セル幅と省略', () => {
  test.each([
    { text: 'A', width: 1 },
    { text: '🍅', width: 2 },
    { text: '☕', width: 2 },
    { text: '界', width: 2 },
    { text: '█━░▏…✓◀⋮', width: 8 },
    { text: '☀️', width: 1 },
  ])('$textの幅は$widthセルである', ({ text, width }) => {
    expect(cellWidth(text)).toBe(width);
  });

  test('上限を超える行は文字の途中で切らずに末尾を…で省略する', () => {
    const line = [{ text: '🍅 WORK', tone: 'work' as const }, { text: ' 8:42' }];

    expect(truncateLine(line, 6)).toEqual([{ text: '🍅 WO', tone: 'work' }, { text: '…' }]);
    expect(truncateLine(line, 2)).toEqual([{ text: '…' }]);
    expect(truncateLine(line, 1)).toEqual([{ text: '…' }]);
    expect(truncateLine(line, 12)).toBe(line);
  });
});

describe('色', () => {
  test('色が有効な場合だけ作業を赤、休憩を緑で着色し、直後に既定色へ戻す', () => {
    const line = [
      { text: 'WORK', tone: 'work' as const },
      { text: ' ' },
      { text: '██', tone: 'break' as const },
    ];

    expect(stringifyFrameLine(line, true)).toBe('\u001B[31mWORK\u001B[39m \u001B[32m██\u001B[39m');
    expect(stringifyFrameLine(line, false)).toBe('WORK ██');
  });

  test.each([
    { enabled: true, env: {} },
    { enabled: true, env: { NO_COLOR: '' } },
    { enabled: false, env: { NO_COLOR: '1' } },
  ])('NO_COLOR=$env.NO_COLORで色の有効状態は$enabledである', ({ enabled, env }) => {
    expect(isColorEnabled(env)).toBe(enabled);
  });
});
