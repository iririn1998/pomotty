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

test('行数が増えた場合は前回の先頭行から全行を書き直し、余分な消去を行わない', () => {
  const { write, writes } = createRecorder(),
    renderer = createInlineRenderer(write);

  renderer.render(['a']);
  renderer.render(['a', 'b', 'c']);

  expect(writes.at(-1)).toBe(`${up(1)}${CLEAR}a\n${CLEAR}b\n${CLEAR}c\n`);
});

test('同じ行数の画面は余った行の消去もカーソルの戻しも行わない', () => {
  const { write, writes } = createRecorder(),
    renderer = createInlineRenderer(write);

  renderer.render(['a', 'b']);
  renderer.render(['c', 'd']);

  expect(writes.at(-1)).toBe(`${up(2)}${CLEAR}c\n${CLEAR}d\n`);
});

test('画面がない状態のログは消去せずにそのまま出力する', () => {
  const { write, writes } = createRecorder(),
    renderer = createInlineRenderer(write);

  renderer.log('first\n');
  renderer.log('second\n');

  expect(writes).toEqual(['first\n', 'second\n']);
});

test('releaseの後のログは旧画面を消さない', () => {
  const { write, writes } = createRecorder(),
    renderer = createInlineRenderer(write);

  renderer.render(['a', 'b']);
  renderer.release();
  renderer.log('done\n');

  expect(writes.at(-1)).toBe('done\n');
});

test('ログの後は直前と同じ内容の画面も描画し直す', () => {
  const { write, writes } = createRecorder(),
    renderer = createInlineRenderer(write);

  renderer.render(['a']);
  renderer.log('done\n');
  renderer.render(['a']);
  renderer.render(['a']);

  expect(writes).toEqual([`${CLEAR}a\n`, `${up(1)}${CLEAR}\n${up(1)}done\n`, `${CLEAR}a\n`]);
});

test('空の画面へ描き直すと旧画面の行を消して先頭行へ戻る', () => {
  const { write, writes } = createRecorder(),
    renderer = createInlineRenderer(write);

  renderer.render(['a', 'b']);
  renderer.render([]);
  renderer.log('done\n');

  expect(writes.slice(1)).toEqual([`${up(2)}${CLEAR}\n${CLEAR}\n${up(2)}`, 'done\n']);
});

test('行を区切る位置が異なれば同じ文字の並びでも描き直す', () => {
  const { write, writes } = createRecorder(),
    renderer = createInlineRenderer(write);

  renderer.render(['ab']);
  renderer.render(['a', 'b']);

  expect(writes).toHaveLength(2);
});
