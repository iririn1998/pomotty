import { expect, test } from 'vitest';
import { PassThrough } from 'node:stream';
import { createDiagnosticWriter } from './writer.ts';

/** 出力先の失敗を再現するための差し替えストリームです。 */
type FakeStream = {
  /** 成否によらない書き込みの試行。 */
  readonly attempts: string[];

  /** 登録済みリスナーへ非同期エラーを配送します。 */
  readonly emitError: () => void;

  readonly errorListeners: (() => void)[];

  readonly on: (event: 'error', listener: () => void) => void;

  readonly write: (output: string) => void;

  /** 成功した書き込み。 */
  readonly writes: string[];
};

const EXPECTED_LISTENER_COUNT = 1,
  createFakeStream = ({ failing = false } = {}): FakeStream => {
    const attempts: string[] = [],
      errorListeners: (() => void)[] = [],
      writes: string[] = [];

    return {
      attempts,
      emitError: (): void => {
        for (const listener of errorListeners) {
          listener();
        }
      },
      errorListeners,
      on: (event: 'error', listener: () => void): void => {
        errorListeners.push(listener);
      },
      write: (output: string): void => {
        attempts.push(output);

        if (failing) {
          throw new Error('EPIPE: broken pipe, write');
        }

        writes.push(output);
      },
      writes,
    };
  };

test('診断をそのまま出力先へ書き込む', () => {
  const stream = createFakeStream(),
    write = createDiagnosticWriter(stream);

  write('Error: Unknown option\n');

  expect(stream.writes).toEqual(['Error: Unknown option\n']);
});

test('最初の書き込みより前にerrorリスナーを登録する', () => {
  const stream = createFakeStream();

  createDiagnosticWriter(stream);

  expect(stream.errorListeners).toHaveLength(EXPECTED_LISTENER_COUNT);
});

test('非同期のerrorイベント後は診断を書き込まない', () => {
  const stream = createFakeStream(),
    write = createDiagnosticWriter(stream);

  stream.emitError();
  write('Error: Unknown option\n');

  expect(stream.attempts).toEqual([]);
});

test('書き込みの同期例外を呼び出し元へ伝播させない', () => {
  const stream = createFakeStream({ failing: true }),
    write = createDiagnosticWriter(stream);

  expect(() => {
    write('Error: Unknown option\n');
  }).not.toThrow();
});

test('実ストリームのerrorイベントを未処理の例外にしない', () => {
  const stream = new PassThrough(),
    write = createDiagnosticWriter(stream);

  // リスナーがなければEventEmitterはこのerrorを同期的にthrowし、
  // 未処理の例外として終了コードを1へ変えてしまう。
  expect(() => {
    stream.emit('error', new Error('EPIPE: broken pipe, write'));
  }).not.toThrow();

  write('Error: Unknown option\n');

  expect(stream.read()).toBeNull();
});

test('一度書き込みに失敗したら以後は書き込みを試みない', () => {
  const stream = createFakeStream({ failing: true }),
    write = createDiagnosticWriter(stream);

  write('Error: first\n');
  write('Error: second\n');

  expect(stream.attempts).toEqual(['Error: first\n']);
});
