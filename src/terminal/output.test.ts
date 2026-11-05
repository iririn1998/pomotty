import { createStandardOutput, isBrokenPipe } from './output.ts';
import { expect, test } from 'vitest';
import { EventEmitter } from 'node:events';
import type { OutputStream } from './output.ts';

type FakeStream = OutputStream & {
  readonly emitError: (error: unknown) => void;
  readonly writes: readonly string[];
};

const createStream = (failWrite?: () => never): FakeStream => {
  const emitter = new EventEmitter(),
    writes: string[] = [];

  return {
    emitError: (error) => {
      emitter.emit('error', error);
    },
    on: (event, listener) => emitter.on(event, listener),
    write: (output) => {
      failWrite?.();
      writes.push(output);
      return true;
    },
    writes,
  };
};

test('書き込みを出力先へ渡す', () => {
  const stream = createStream(),
    write = createStandardOutput(() => {
      throw new Error('unexpected failure');
    }, stream);

  write('a');
  write('b');

  expect(stream.writes).toEqual(['a', 'b']);
});

test('非同期のerrorイベントを1回だけ通知し、以後の書き込みを省略する', () => {
  const failures: unknown[] = [],
    stream = createStream(),
    write = createStandardOutput((error) => {
      failures.push(error);
    }, stream),
    brokenPipe = Object.assign(new Error('write EPIPE'), { code: 'EPIPE' });

  write('before');
  stream.emitError(brokenPipe);
  stream.emitError(new Error('second'));
  write('after');

  expect(failures).toEqual([brokenPipe]);
  expect(stream.writes).toEqual(['before']);
});

test('書き込み時の同期例外を同じ処理へ渡す', () => {
  const failures: unknown[] = [],
    failure = new Error('stream destroyed'),
    stream = createStream(() => {
      throw failure;
    }),
    write = createStandardOutput((error) => {
      failures.push(error);
    }, stream);

  write('first');
  write('second');

  expect(failures).toEqual([failure]);
});

test('最初の書き込みより前にerrorリスナーを登録する', () => {
  const stream = createStream();

  createStandardOutput(() => {
    // 失敗の内容はこのテストでは確認しません。
  }, stream);

  expect(() => {
    stream.emitError(new Error('closed'));
  }).not.toThrow();
});

test.each([
  { error: Object.assign(new Error('write EPIPE'), { code: 'EPIPE' }), expected: true },
  { error: Object.assign(new Error('write EIO'), { code: 'EIO' }), expected: false },
  { error: new Error('EPIPE'), expected: false },
  { error: 'EPIPE', expected: false },
  { error: null, expected: false },
])('EPIPEを判定する: $error', ({ error, expected }) => {
  expect(isBrokenPipe(error)).toBe(expected);
});
