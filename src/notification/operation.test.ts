import {
  COMPLETION_GRACE_MS,
  DETACH_DELAY_MS,
  SIGKILL_DELAY_MS,
  createOperationTracker,
} from './operation.ts';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import type { OperationResult, OperationTracker } from './operation.ts';
import type { FakeSpawner } from './fake-child.test-helper.ts';
import { createFakeSpawner } from './fake-child.test-helper.ts';
import process from 'node:process';

type TrackerHarness = {
  readonly results: string[];
  readonly spawner: FakeSpawner;
  readonly start: (name: string, completionNotice?: boolean) => void;
  readonly tracker: OperationTracker;
};

const COMMAND = '/usr/bin/paplay',
  /** 偽の子プロセスで追跡処理を作成し、操作の結果を記録します。 */
  createTracker = (): TrackerHarness => {
    const spawner = createFakeSpawner(),
      results: string[] = [],
      tracker = createOperationTracker(spawner.spawnChild),
      start = (name: string, completionNotice = false): void => {
        tracker.startOperation(completionNotice, async (operation) => {
          const result: OperationResult = await tracker.runChild(operation, COMMAND, [name]);

          results.push(`${name}:${result}`);
        });
      };

    return { results, spawner, start, tracker };
  },
  flush = async (): Promise<void> => {
    await vi.advanceTimersByTimeAsync(0);
  };

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

test('shutdownでは実行中の操作をcancelledで直ちに確定し、子プロセスへ終了要求を送る', async () => {
  const { results, spawner, start, tracker } = createTracker();

  start('work');
  await tracker.shutdown({ complete: false });

  expect(results).toEqual(['work:cancelled']);
  expect(spawner.children[0]?.signals).toEqual(['SIGTERM']);
});

test('終了しない子プロセスへは500ms後にSIGKILLを送り、1500ms後に切り離す', async () => {
  const { spawner, start, tracker } = createTracker();

  start('work');
  await tracker.shutdown({ complete: false });
  await vi.advanceTimersByTimeAsync(SIGKILL_DELAY_MS - 1);

  expect(spawner.children[0]?.signals).toEqual(['SIGTERM']);

  await vi.advanceTimersByTimeAsync(1);

  expect(spawner.children[0]?.signals).toEqual(['SIGTERM', 'SIGKILL']);
  expect(spawner.children[0]?.isDetached()).toBe(false);

  await vi.advanceTimersByTimeAsync(DETACH_DELAY_MS - SIGKILL_DELAY_MS);

  expect(spawner.children[0]?.isDetached()).toBe(true);
  expect(tracker.activeChildCount()).toBe(1);
});

test('終了要求で子プロセスが終了したら段階的な強制終了を行わない', async () => {
  const { spawner, start, tracker } = createTracker();

  start('work');
  await tracker.shutdown({ complete: false });
  spawner.children[0]?.emitClose(null, 'SIGTERM');
  await vi.advanceTimersByTimeAsync(DETACH_DELAY_MS);

  expect(spawner.children[0]?.signals).toEqual(['SIGTERM']);
  expect(spawner.children[0]?.isDetached()).toBe(false);
  expect(tracker.activeChildCount()).toBe(0);
});

test('shutdown開始後は新しい操作も子プロセスも開始しない', async () => {
  const { results, spawner, start, tracker } = createTracker();

  await tracker.shutdown({ complete: false });
  start('break');
  await flush();

  expect(spawner.children).toEqual([]);
  expect(results).toEqual([]);
});

test('shutdownを複数回呼んでも同じPromiseを返し、終了要求は1回だけ送る', async () => {
  const { spawner, start, tracker } = createTracker();

  start('work');

  const first = tracker.shutdown({ complete: false }),
    second = tracker.shutdown({ complete: true });

  expect(second).toBe(first);
  await first;
  expect(spawner.children[0]?.signals).toEqual(['SIGTERM']);
});

test('完了終了では完了通知操作の確定を待ち、それ以外の操作は直ちにキャンセルする', async () => {
  const { results, spawner, start, tracker } = createTracker();
  let shutdownFinished = false;

  start('work');
  start('final-break', true);
  void tracker.shutdown({ complete: true }).then(() => {
    shutdownFinished = true;
  });
  await flush();

  expect(results).toEqual(['work:cancelled']);
  expect(spawner.children.map(({ signals }) => signals)).toEqual([[], []]);
  expect(shutdownFinished).toBe(false);

  spawner.children[1]?.emitClose(0);
  await flush();

  expect(results).toEqual(['work:cancelled', 'final-break:success']);
  expect(shutdownFinished).toBe(true);
  // 猶予の終了後に、キャンセル済み操作の子プロセスへ終了要求を送ります。
  expect(spawner.children.map(({ signals }) => signals)).toEqual([['SIGTERM'], []]);
});

test('完了通知が3000ms以内に確定しなければキャンセルして終了要求を送る', async () => {
  const { results, spawner, start, tracker } = createTracker();

  start('final-break', true);
  void tracker.shutdown({ complete: true });
  await vi.advanceTimersByTimeAsync(COMPLETION_GRACE_MS - 1);

  expect(results).toEqual([]);
  expect(spawner.children[0]?.signals).toEqual([]);

  await vi.advanceTimersByTimeAsync(1);

  expect(results).toEqual(['final-break:cancelled']);
  expect(spawner.children[0]?.signals).toEqual(['SIGTERM']);
});

test('完了通知の猶予中は完了通知操作の次の候補を起動できる', async () => {
  const { spawner, tracker } = createTracker(),
    results: string[] = [];

  tracker.startOperation(true, async (operation) => {
    const first = await tracker.runChild(operation, COMMAND, []),
      second = await tracker.runChild(operation, '/usr/bin/aplay', []);

    results.push(first, second);
  });
  void tracker.shutdown({ complete: true });
  spawner.children[0]?.emitClose(1);
  await flush();

  expect(spawner.children.map(({ commandPath }) => commandPath)).toEqual([
    COMMAND,
    '/usr/bin/aplay',
  ]);

  spawner.children[1]?.emitClose(0);
  await flush();

  expect(results).toEqual(['failure', 'success']);
});

test('完了通知操作がなければ猶予を設けない', async () => {
  const { spawner, start, tracker } = createTracker();

  start('work');
  await tracker.shutdown({ complete: true });

  expect(spawner.children[0]?.signals).toEqual(['SIGTERM']);
});

test('キャンセル済みの操作へ登録した処理は同期的に1回呼ばれる', () => {
  const { tracker } = createTracker(),
    calls: string[] = [];

  tracker.startOperation(false, (operation) => {
    operation.cancel();
    operation.cancel();
    operation.onCancel(() => {
      calls.push('late');
    });
    return Promise.resolve();
  });

  expect(calls).toEqual(['late']);
});

test('実際の子プロセスもshutdownで終了し、追跡対象から外れる', async () => {
  vi.useRealTimers();

  const tracker = createOperationTracker(),
    results: OperationResult[] = [],
    closeListeners: (() => void)[] = [],
    closed = new Promise<void>((resolve) => {
      closeListeners.push(() => {
        resolve();
      });
    });

  tracker.startOperation(false, (operation) => {
    const spawned = tracker.spawnTracked(operation, process.execPath, [
      '-e',
      'setTimeout(() => {}, 60_000)',
    ]);

    if (spawned.result === 'success') {
      spawned.child.onClose(() => {
        for (const listener of closeListeners) {
          listener();
        }
      });
    }

    results.push(spawned.result);
    return Promise.resolve();
  });

  expect(tracker.activeChildCount()).toBe(1);

  await tracker.shutdown({ complete: false });
  await closed;

  expect(results).toEqual(['success']);
  expect(tracker.activeChildCount()).toBe(0);
});
