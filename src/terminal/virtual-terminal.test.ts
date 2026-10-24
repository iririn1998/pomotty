import { describe, expect, test } from 'vitest';
import { createVirtualTerminal } from './virtual-terminal.test-helper.ts';

describe('偽の端末', () => {
  test('改行で次の行の先頭へ移り、行末の空白と末尾の空行を除いて返す', () => {
    const terminal = createVirtualTerminal();

    terminal.write('a  \nb\n\n');

    expect(terminal.lines()).toEqual(['a', 'b']);
    expect(terminal.text()).toBe('a\nb');
  });

  test('復帰で行頭へ戻り、既存の文字へ上書きする', () => {
    const terminal = createVirtualTerminal();

    terminal.write('abc\rX');

    expect(terminal.lines()).toEqual(['Xbc']);
  });

  test('カーソルを上へ移動して行を消去し、描き直せる', () => {
    const terminal = createVirtualTerminal();

    terminal.write('one\ntwo\n\u001B[2A\u001B[2Kuno\n');

    expect(terminal.lines()).toEqual(['uno', 'two']);
  });

  test('画面末尾の消去ではカーソル位置から後ろをすべて消す', () => {
    const terminal = createVirtualTerminal();

    terminal.write('question\n> OK\n  NG\r\u001B[1A\u001B[J');

    expect(terminal.lines()).toEqual(['question']);
  });

  test('2セル幅の文字と結合文字を1文字として扱う', () => {
    const terminal = createVirtualTerminal({ columns: 6 });

    terminal.write('🍅ab\r☕');
    terminal.write('\n⏹️x');

    expect(terminal.lines()).toEqual(['☕ab', '⏹️x']);
    expect(terminal.wraps()).toBe(0);
  });

  test('右端を超える文字は次の行へ折り返し、回数を数える', () => {
    const terminal = createVirtualTerminal({ columns: 4 });

    terminal.write('abcd');

    expect(terminal.wraps()).toBe(0);

    terminal.write('e\n123🍅');

    expect(terminal.lines()).toEqual(['abcd', 'e', '123', '🍅']);
    expect(terminal.wraps()).toBe(2);
  });

  test('色の付いた部分をタグで囲んで返す', () => {
    const terminal = createVirtualTerminal();

    terminal.write('\u001B[31mred\u001B[39m plain \u001B[32mgreen\u001B[0m');

    expect(terminal.coloredLines()).toEqual(['<red>red</red> plain <green>green</green>']);
    expect(terminal.lines()).toEqual(['red plain green']);
  });

  test('カーソルの表示切り替えとベルを記録する', () => {
    const terminal = createVirtualTerminal();

    terminal.write('\u001B[?25l');

    expect(terminal.cursorVisible()).toBe(false);

    terminal.write('\u0007\u0007\u001B[?25h');

    expect(terminal.cursorVisible()).toBe(true);
    expect(terminal.bells()).toBe(2);
  });

  test.each([
    { name: '未対応の制御列', output: '\u001B[5C' },
    { name: '未対応のSGR', output: '\u001B[1m' },
    { name: '未対応の制御文字', output: '\t' },
  ])('$nameは誤った出力として例外にする', ({ output }) => {
    expect(() => createVirtualTerminal().write(output)).toThrow();
  });

  test('列数の変更でresizeリスナーを呼び出す', () => {
    const terminal = createVirtualTerminal({ columns: 80 }),
      seen: number[] = [],
      listener = (): void => {
        seen.push(terminal.columns);
      };

    terminal.on('resize', listener);
    terminal.resize(40);
    terminal.off?.('resize', listener);
    terminal.resize(20);

    expect(seen).toEqual([40]);
    expect(terminal.resizeListenerCount()).toBe(0);
  });
});
