import { describe, expect, test } from 'vitest';
import { mkdtempSync, openSync, closeSync, readFileSync, rmSync } from 'node:fs';
import { EventEmitter } from 'node:events';
import type { ProcessEvents, TerminalGuard, TerminationSignal } from './terminal-guard.ts';
import { createTerminalGuard } from './terminal-guard.ts';
import path from 'node:path';
import { tmpdir } from 'node:os';

const HIDE_CURSOR = '\u001B[?25l',
  SHOW_CURSOR = '\u001B[?25h',
  /** 登録されたリスナーを数え、イベントを発生させられる偽のプロセスを作成します。 */
  createProcessEvents = (): ProcessEvents & {
    readonly emit: (event: string) => void;
    readonly listenerCount: (event: string) => number;
  } => {
    const emitter = new EventEmitter();

    return {
      emit: (event) => {
        emitter.emit(event);
      },
      listenerCount: (event) => emitter.listenerCount(event),
      off: (event, listener) => emitter.off(event, listener),
      on: (event, listener) => emitter.on(event, listener),
    };
  },
  /** 端末の状態を管理する処理と、書き込みとシグナルの記録を作成します。 */
  createGuard = (
    fd?: number,
  ): {
    readonly guard: TerminalGuard;
    readonly processEvents: ReturnType<typeof createProcessEvents>;
    readonly signals: readonly TerminationSignal[];
    readonly writes: readonly string[];
  } => {
    const processEvents = createProcessEvents(),
      signals: TerminationSignal[] = [],
      writes: string[] = [],
      guard = createTerminalGuard({
        onSignal: (signal) => {
          signals.push(signal);
        },
        processEvents,
        terminal: { fd, on: () => true, write: () => true },
        write: (output) => {
          writes.push(output);
        },
      });

    return { guard, processEvents, signals, writes };
  };

describe('端末の状態の管理', () => {
  test('作成時にSIGHUP、SIGINT、SIGTERMを捕捉し、既定の終了の代わりにonSignalへ渡す', () => {
    const { processEvents, signals } = createGuard();

    processEvents.emit('SIGTERM');
    processEvents.emit('SIGHUP');
    processEvents.emit('SIGINT');

    expect(signals).toEqual(['SIGTERM', 'SIGHUP', 'SIGINT']);
    expect(processEvents.listenerCount('exit')).toBe(0);
  });

  test('カーソルは1回だけ隠し、隠している間だけexitの保険を登録する', () => {
    const { guard, processEvents, writes } = createGuard();

    guard.hideCursor();
    guard.hideCursor();

    expect(writes).toEqual([HIDE_CURSOR]);
    expect(processEvents.listenerCount('exit')).toBe(1);
  });

  test('解除するとカーソルを表示し直し、登録したリスナーをすべて解除する', () => {
    const { guard, processEvents, signals, writes } = createGuard();

    guard.hideCursor();
    guard.release();
    guard.release();
    processEvents.emit('SIGTERM');

    expect(writes).toEqual([HIDE_CURSOR, SHOW_CURSOR]);
    expect(signals).toEqual([]);

    for (const event of ['exit', 'SIGHUP', 'SIGINT', 'SIGTERM']) {
      expect(processEvents.listenerCount(event)).toBe(0);
    }
  });

  test('カーソルを隠していなければ、解除してもカーソルの制御列を書き込まない', () => {
    const { guard, writes } = createGuard();

    guard.release();

    expect(writes).toEqual([]);
  });

  test('解除後はカーソルを隠さない', () => {
    const { guard, processEvents, writes } = createGuard();

    guard.release();
    guard.hideCursor();

    expect(writes).toEqual([]);
    expect(processEvents.listenerCount('exit')).toBe(0);
  });

  test('exitではファイル記述子へ同期的にカーソルの表示を書き込む', () => {
    const directory = mkdtempSync(path.join(tmpdir(), 'pomotty-guard-')),
      file = path.join(directory, 'terminal'),
      fd = openSync(file, 'w');

    try {
      const { guard, processEvents } = createGuard(fd);

      guard.hideCursor();
      processEvents.emit('exit');

      expect(readFileSync(file, 'utf8')).toBe(SHOW_CURSOR);
    } finally {
      closeSync(fd);
      rmSync(directory, { force: true, recursive: true });
    }
  });

  test('ファイル記述子がない、または書き込めない場合もexitで例外を投げない', () => {
    for (const fd of [undefined, -1]) {
      const { guard, processEvents } = createGuard(fd);

      guard.hideCursor();

      expect(() => {
        processEvents.emit('exit');
      }).not.toThrow();
    }
  });
});
