import { mkdtemp, open, readFile, rm } from 'node:fs/promises';
import { describe, expect, test } from 'vitest';
import { EventEmitter } from 'node:events';
import type { OutputStream } from './output.ts';
import type { TerminationSignal } from './terminal-guard.ts';
import { createTerminalGuard } from './terminal-guard.ts';
import os from 'node:os';
import path from 'node:path';

type GuardHarness = {
  readonly emit: (event: string) => void;
  readonly guard: ReturnType<typeof createTerminalGuard>;
  readonly listenerCounts: () => Record<string, number>;
  readonly signals: TerminationSignal[];
  readonly writes: string[];
};

const HIDE_CURSOR = '\u001B[?25l',
  SHOW_CURSOR = '\u001B[?25h',
  createTerminal = (fd?: number): OutputStream => ({
    fd,
    on: () => {
      // このテストでは端末のイベントを使いません。
    },
    write: () => {
      // このテストでは同期的な書き込みだけを確認します。
    },
  }),
  /** 偽のプロセスと端末で、端末の状態を管理する処理を作成します。 */
  createHarness = (terminal: OutputStream = createTerminal()): GuardHarness => {
    const emitter = new EventEmitter(),
      signals: TerminationSignal[] = [],
      writes: string[] = [],
      guard = createTerminalGuard({
        onSignal: (signal) => {
          signals.push(signal);
        },
        processEvents: {
          off: (event, listener) => emitter.off(event, listener),
          on: (event, listener) => emitter.on(event, listener),
        },
        terminal,
        write: (output) => {
          writes.push(output);
        },
      });

    return {
      emit: (event) => {
        emitter.emit(event);
      },
      guard,
      listenerCounts: () =>
        Object.fromEntries(
          emitter.eventNames().map((event) => [String(event), emitter.listenerCount(event)]),
        ),
      signals,
      writes,
    };
  };

describe('シグナル', () => {
  test('作成時にSIGHUP、SIGINT、SIGTERMのリスナーを登録し、カーソルは操作しない', () => {
    const { listenerCounts, writes } = createHarness();

    expect(listenerCounts()).toEqual({ SIGHUP: 1, SIGINT: 1, SIGTERM: 1 });
    expect(writes).toEqual([]);
  });

  test('受け取ったシグナルの名前を通知する', () => {
    const { emit, signals } = createHarness();

    emit('SIGTERM');
    emit('SIGHUP');
    emit('SIGINT');

    expect(signals).toEqual(['SIGTERM', 'SIGHUP', 'SIGINT']);
  });

  test('release後はシグナルを通知せず、リスナーを残さない', () => {
    const { emit, guard, listenerCounts, signals } = createHarness();

    guard.release();
    emit('SIGINT');

    expect(signals).toEqual([]);
    expect(listenerCounts()).toEqual({});
  });
});

describe('カーソル', () => {
  test('hideCursorは1回だけカーソルを隠し、exitのリスナーを登録する', () => {
    const { guard, listenerCounts, writes } = createHarness();

    guard.hideCursor();
    guard.hideCursor();

    expect(writes).toEqual([HIDE_CURSOR]);
    expect(listenerCounts()).toMatchObject({ exit: 1 });
  });

  test('releaseはカーソルを1回だけ表示し直し、exitのリスナーを解除する', () => {
    const { guard, listenerCounts, writes } = createHarness();

    guard.hideCursor();
    guard.release();
    guard.release();

    expect(writes).toEqual([HIDE_CURSOR, SHOW_CURSOR]);
    expect(listenerCounts()).toEqual({});
  });

  test('カーソルを隠していなければreleaseでカーソルを表示しない', () => {
    const { guard, writes } = createHarness();

    guard.release();

    expect(writes).toEqual([]);
  });

  test('release後のhideCursorはカーソルを隠さない', () => {
    const { guard, listenerCounts, writes } = createHarness();

    guard.release();
    guard.hideCursor();

    expect(writes).toEqual([]);
    expect(listenerCounts()).toEqual({});
  });
});

describe('終了時の同期的な復元', () => {
  test('カーソルを隠している間にプロセスが終了すると、ファイル記述子へ同期的にカーソルを表示する', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'pomotty-')),
      file = path.join(directory, 'terminal');

    try {
      const handle = await open(file, 'w');

      try {
        const { emit, guard, writes } = createHarness(createTerminal(handle.fd));

        guard.hideCursor();
        emit('exit');

        // プロセスのexitイベントの処理中に書き込みを終えているため、待たずに読める
        expect(await readFile(file, 'utf8')).toBe(SHOW_CURSOR);
        // 通常の書き込み処理はカーソルを隠すときだけ使う
        expect(writes).toEqual([HIDE_CURSOR]);
      } finally {
        await handle.close();
      }
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });

  test('ファイル記述子を持たない端末では何もしない', () => {
    const { emit, guard } = createHarness(createTerminal());

    guard.hideCursor();

    expect(() => {
      emit('exit');
    }).not.toThrow();
  });

  test('ファイル記述子へ書き込めなくても例外にしない', () => {
    const { emit, guard } = createHarness(createTerminal(-1));

    guard.hideCursor();

    expect(() => {
      emit('exit');
    }).not.toThrow();
  });
});
