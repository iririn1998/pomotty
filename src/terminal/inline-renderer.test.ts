import { createInlineRenderer } from './inline-renderer.ts';
import { expect, test } from 'vitest';

const up = (rows: number): string => `\u001B[${rows}A`,
  CLEAR = '\u001B[2K',
  createRecorder = (): { readonly writes: string[]; readonly write: (output: string) => void } => {
    const writes: string[] = [];

    return {
      write: (output) => {
        writes.push(output);
      },
      writes,
    };
  };

test('初回はカーソルを移動せず、各行の末尾に改行を付けて描画する', () => {
  const { write, writes } = createRecorder();

  createInlineRenderer(write).render(['a', 'b']);

  expect(writes).toEqual([`${CLEAR}a\n${CLEAR}b\n`]);
});

test('2回目以降は前回の先頭行へ戻って上書きし、同じ内容なら書き込まない', () => {
  const { write, writes } = createRecorder(),
    renderer = createInlineRenderer(write);

  renderer.render(['a', 'b']);
  renderer.render(['a', 'b']);
  renderer.render(['a', 'c']);

  expect(writes).toEqual([`${CLEAR}a\n${CLEAR}b\n`, `${up(2)}${CLEAR}a\n${CLEAR}c\n`]);
});

test('行数が減った場合は余った旧行を消し、カーソルを新しい画面の直後へ戻す', () => {
  const { write, writes } = createRecorder(),
    renderer = createInlineRenderer(write);

  renderer.render(['a', 'b', 'c']);
  renderer.render(['d']);

  expect(writes.at(-1)).toBe(`${up(3)}${CLEAR}d\n${CLEAR}\n${CLEAR}\n${up(2)}`);
});

test('ログは現在の画面を消してから出力し、次の画面をその下へ描画する', () => {
  const { write, writes } = createRecorder(),
    renderer = createInlineRenderer(write);

  renderer.render(['a', 'b']);
  renderer.log('done\n');
  renderer.render(['a', 'b']);

  expect(writes).toEqual([
    `${CLEAR}a\n${CLEAR}b\n`,
    `${up(2)}${CLEAR}\n${CLEAR}\n${up(2)}done\n`,
    `${CLEAR}a\n${CLEAR}b\n`,
  ]);
});

test('releaseの後は旧画面を消さず、現在位置から新しい画面を追記する', () => {
  const { write, writes } = createRecorder(),
    renderer = createInlineRenderer(write);

  renderer.render(['a']);
  renderer.release();
  renderer.render(['a']);

  expect(writes).toEqual([`${CLEAR}a\n`, `${CLEAR}a\n`]);
});
