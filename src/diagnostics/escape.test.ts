import { expect, test } from 'vitest';
import { escapeDiagnostic } from './escape.ts';

const EXCEEDING_OFFSET = 1,
  MAXIMUM_CODE_POINTS = 160;

test('通常の文字列は二重引用符で囲むだけにする', () => {
  expect(escapeDiagnostic('--work')).toBe('"--work"');
});

test('空文字列も二重引用符で囲む', () => {
  expect(escapeDiagnostic('')).toBe('""');
});

test.each([
  { expected: String.raw`"a\\b"`, name: 'バックスラッシュ', value: 'a\\b' },
  { expected: String.raw`"a\"b"`, name: '二重引用符', value: 'a"b' },
])('$nameをエスケープする', ({ expected, value }) => {
  expect(escapeDiagnostic(value)).toBe(expected);
});

test.each([
  { expected: String.raw`"\x00"`, name: 'NUL', value: '\u0000' },
  { expected: String.raw`"\x0A"`, name: '改行', value: '\n' },
  { expected: String.raw`"\x0D"`, name: '復帰', value: '\r' },
  { expected: String.raw`"\x09"`, name: 'タブ', value: '\t' },
  { expected: String.raw`"\x1B"`, name: 'ESC', value: '\u001B' },
  { expected: String.raw`"\x7F"`, name: 'DEL', value: '\u007F' },
  { expected: String.raw`"\x85"`, name: 'C1のNEL', value: '\u0085' },
  { expected: String.raw`"\x9F"`, name: 'C1の上端', value: '\u009F' },
])('$nameを大文字2桁の16進数表記へ変換する', ({ expected, value }) => {
  expect(escapeDiagnostic(value)).toBe(expected);
});

test.each([
  { expected: String.raw`"\u{61C}"`, name: 'ALM', value: '\u061C' },
  { expected: String.raw`"\u{200B}"`, name: 'ZWSP', value: '\u200B' },
  { expected: String.raw`"\u{200E}"`, name: 'LRM', value: '\u200E' },
  { expected: String.raw`"\u{200F}"`, name: 'RLM', value: '\u200F' },
  { expected: String.raw`"\u{2028}"`, name: 'LS', value: '\u2028' },
  { expected: String.raw`"\u{202E}"`, name: 'RLO', value: '\u202E' },
  { expected: String.raw`"\u{2066}"`, name: 'LRI', value: '\u2066' },
  { expected: String.raw`"\u{206F}"`, name: '非推奨の方向書式制御', value: '\u206F' },
  { expected: String.raw`"\u{FEFF}"`, name: 'BOM', value: '\uFEFF' },
])('$nameを大文字の波括弧付き16進数表記へ変換する', ({ expected, value }) => {
  expect(escapeDiagnostic(value)).toBe(expected);
});

test.each([
  { expected: String.raw`"\uD800"`, name: '上位', value: '\uD800' },
  { expected: String.raw`"\uDFFF"`, name: '下位', value: '\uDFFF' },
])('対応しないサロゲート（$name）を大文字4桁の16進数表記へ変換する', ({ expected, value }) => {
  expect(escapeDiagnostic(value)).toBe(expected);
});

test.each([
  { name: '絵文字', value: '😀' },
  { name: 'ZWJシーケンス', value: '👨‍👩‍👧' },
  { name: 'ZWNJ', value: '\u200C' },
  { name: '日本語', value: '仕様書レビュー' },
])('$nameは変更しない', ({ value }) => {
  expect(escapeDiagnostic(value)).toBe(`"${value}"`);
});

test('160コードポイントちょうどは省略記号を付けない', () => {
  const value = 'A'.repeat(MAXIMUM_CODE_POINTS);

  expect(escapeDiagnostic(value)).toBe(`"${value}"`);
});

test('160コードポイントを超える入力を切り詰めて省略記号を付ける', () => {
  const value = 'A'.repeat(MAXIMUM_CODE_POINTS + EXCEEDING_OFFSET);

  expect(escapeDiagnostic(value)).toBe(`"${'A'.repeat(MAXIMUM_CODE_POINTS)}…"`);
});

test('上限はUTF-16コード単位ではなくコードポイントで数える', () => {
  const value = '😀'.repeat(MAXIMUM_CODE_POINTS);

  expect(escapeDiagnostic(value)).toBe(`"${value}"`);
});

test('エスケープ後の長さではなく入力のコードポイント数で切り詰める', () => {
  const value = '\n'.repeat(MAXIMUM_CODE_POINTS + EXCEEDING_OFFSET);

  expect(escapeDiagnostic(value)).toBe(`"${String.raw`\x0A`.repeat(MAXIMUM_CODE_POINTS)}…"`);
});

test('改行とANSIを含む入力が1行の有限長文字列になる', () => {
  const escaped = escapeDiagnostic('--u\u001B[31m\nFORGED LOG LINE\u001B[2J');

  expect(escaped).toBe(String.raw`"--u\x1B[31m\x0AFORGED LOG LINE\x1B[2J"`);
  expect(escaped).not.toMatch(/[\u0000-\u001F]/u);
});

test('エスケープ結果を再度エスケープしても壊れない', () => {
  expect(escapeDiagnostic(escapeDiagnostic('\n'))).toBe(String.raw`"\"\\x0A\""`);
});
