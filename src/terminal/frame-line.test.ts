import {
  cellWidth,
  isColorEnabled,
  lineWidth,
  stringifyFrameLine,
  truncateLine,
} from './frame-line.ts';
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

describe('セル幅の詳細', () => {
  test.each([
    { name: '空文字列', text: '', width: 0 },
    { name: 'ZWJ', text: '\u200D', width: 0 },
    { name: 'テキスト表示の異体字セレクタ', text: '\uFE0E', width: 0 },
    { name: '絵文字表示の異体字セレクタ', text: '\uFE0F', width: 0 },
    { name: 'ハングル字母', text: '\u1100', width: 2 },
    { name: 'ハングル音節', text: '한', width: 2 },
    { name: 'ひらがな', text: 'あ', width: 2 },
    { name: '全角英数字', text: 'Ａ１', width: 4 },
    { name: '全角記号', text: '￥', width: 2 },
    { name: 'CJK互換漢字', text: '\uF900', width: 2 },
    { name: '半角カナ', text: 'ｱ', width: 1 },
    { name: 'ZWJで結合した絵文字', text: '👨‍👩‍👧', width: 6 },
    { name: '拡張絵文字', text: '🫠', width: 2 },
    { name: '絵文字と英字', text: '🍅 WORK', width: 7 },
  ])('$nameの幅は$widthセルである', ({ text, width }) => {
    expect(cellWidth(text)).toBe(width);
  });

  test('表示行の幅は各文字列片の幅の合計である', () => {
    expect(lineWidth([])).toBe(0);
    expect(lineWidth([{ text: '🍅 ' }, { text: 'WORK', tone: 'work' }, { text: '' }])).toBe(7);
  });
});

describe('省略の詳細', () => {
  test('ちょうど上限に収まる行は省略しない', () => {
    const line = [{ text: 'ABC' }, { text: 'DE', tone: 'break' as const }];

    expect(truncateLine(line, 5)).toBe(line);
  });

  test('2つ目以降の文字列片で上限を超える場合は、それまでの文字列片を保つ', () => {
    const line = [{ text: 'AB' }, { text: 'CDEF', tone: 'break' as const }, { text: 'GH' }];

    expect(truncateLine(line, 5)).toEqual([
      { text: 'AB' },
      { text: 'CD', tone: 'break' },
      { text: '…' },
    ]);
  });

  test('2セル幅の文字が上限をまたぐ場合はその文字を含めない', () => {
    expect(truncateLine([{ text: 'A界B' }], 3)).toEqual([{ text: 'A' }, { text: '…' }]);
  });

  test('文字列片の境界で上限に達した場合は次の文字列片を含めない', () => {
    expect(truncateLine([{ text: 'AB' }, { text: 'CD', tone: 'work' }], 3)).toEqual([
      { text: 'AB' },
      { text: '…' },
    ]);
  });

  test('空の文字列片は省略後に残さない', () => {
    expect(truncateLine([{ text: '' }, { text: 'ABCD' }], 3)).toEqual([
      { text: 'AB' },
      { text: '…' },
    ]);
  });
});

describe('文字列化', () => {
  test('行末の空白は出力せず、行頭と途中の空白は保つ', () => {
    expect(stringifyFrameLine([{ text: '  A ' }, { text: ' B' }, { text: '   ' }], false)).toBe(
      '  A  B',
    );
  });

  test('色が有効でも、空の文字列片とtoneのない文字列片は着色しない', () => {
    expect(
      stringifyFrameLine(
        [{ text: '', tone: 'work' }, { text: 'A' }, { text: 'B', tone: 'work' }],
        true,
      ),
    ).toBe('A\u001B[31mB\u001B[39m');
  });

  test('空の表示行は空文字列になる', () => {
    expect(stringifyFrameLine([], true)).toBe('');
  });

  test('NO_COLORが未定義の場合は色を有効にする', () => {
    expect(isColorEnabled({ NO_COLOR: undefined })).toBe(true);
  });
});
