import {
  COMPLETION_GRACE_MS,
  DETACH_DELAY_MS,
  FORCE_KILL_DELAY_MS,
  PLAYER_TIMEOUT_MS,
  SIGKILL_DELAY_MS,
  createOperationTracker,
  spawnNodeChild,
} from './operation.ts';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { Operation, OperationResult, OperationTracker, SpawnChild } from './operation.ts';
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

/** 操作を1つ開始し、その操作を返します。 */
const startOperation = (tracker: OperationTracker, completionNotice = false): Operation => {
  let started: Operation | undefined;

  tracker.startOperation(completionNotice, (operation) => {
    started = operation;
    return new Promise(() => {
      // 操作の確定はテストから制御します。
    });
  });

  if (started === undefined) {
    throw new Error('operation was not started');
  }

  return started;
};

describe('子プロセスの実行結果', () => {
  test.each([
    { code: 0, expected: 'success', name: '終了コード0', signal: null },
    { code: 1, expected: 'failure', name: '0以外の終了コード', signal: null },
    { code: null, expected: 'failure', name: 'シグナルによる終了', signal: 'SIGTERM' as const },
    { code: 0, expected: 'failure', name: '終了コード0とシグナル', signal: 'SIGKILL' as const },
  ])('$nameは$expectedとする', async ({ code, expected, signal }) => {
    const { spawner, tracker } = createTracker(),
      result = tracker.runChild(startOperation(tracker), COMMAND, []);

    spawner.children[0]?.emitClose(code, signal);

    expect(await result).toBe(expected);
    expect(tracker.activeChildCount()).toBe(0);
  });

  test('errorイベントは失敗とする', async () => {
    const { spawner, tracker } = createTracker(),
      result = tracker.runChild(startOperation(tracker), COMMAND, []);

    spawner.children[0]?.emitError();

    expect(await result).toBe('failure');
  });

  test('起動時の同期例外は失敗とし、子プロセスを追跡しない', async () => {
    const spawner = createFakeSpawner(new Set([COMMAND])),
      tracker = createOperationTracker(spawner.spawnChild);

    expect(await tracker.runChild(startOperation(tracker), COMMAND, [])).toBe('failure');
    expect(tracker.activeChildCount()).toBe(0);
  });

  test('コマンド、引数、環境変数をそのまま渡す', () => {
    const { spawner, tracker } = createTracker();

    void tracker.runChild(startOperation(tracker), COMMAND, ['--volume', '0.6'], {
      env: { POMOTTY_SOUND_FILE: '/tmp/a.wav' },
    });

    expect(spawner.children[0]).toMatchObject({
      commandArguments: ['--volume', '0.6'],
      commandPath: COMMAND,
      env: { POMOTTY_SOUND_FILE: '/tmp/a.wav' },
    });
  });

  test('キャンセル済みの操作では子プロセスを起動しない', async () => {
    const { spawner, tracker } = createTracker(),
      operation = startOperation(tracker);

    operation.cancel();

    expect(await tracker.runChild(operation, COMMAND, [])).toBe('cancelled');
    expect(tracker.spawnTracked(operation, COMMAND, [])).toEqual({ result: 'cancelled' });
    expect(spawner.children).toEqual([]);
  });

  test('実行中に操作をキャンセルすると直ちにcancelledで確定し、打ち切りのtimerを解除する', async () => {
    const { spawner, tracker } = createTracker(),
      operation = startOperation(tracker),
      result = tracker.runChild(operation, COMMAND, []);

    operation.cancel();

    expect(await result).toBe('cancelled');

    await vi.advanceTimersByTimeAsync(PLAYER_TIMEOUT_MS + FORCE_KILL_DELAY_MS);

    expect(spawner.children[0]?.signals).toEqual([]);
    expect(tracker.activeChildCount()).toBe(1);
  });

  test('打ち切りまでの時間を指定できる', async () => {
    const { spawner, tracker } = createTracker(),
      result = tracker.runChild(startOperation(tracker), COMMAND, [], { timeoutMs: 100 });

    await vi.advanceTimersByTimeAsync(99);

    expect(spawner.children[0]?.signals).toEqual([]);

    await vi.advanceTimersByTimeAsync(1);

    expect(await result).toBe('failure');
    expect(spawner.children[0]?.signals).toEqual(['SIGTERM']);
  });

  test('確定後に発生した子プロセスのイベントは結果を変えない', async () => {
    const { spawner, tracker } = createTracker(),
      result = tracker.runChild(startOperation(tracker), COMMAND, []);

    spawner.children[0]?.emitClose(0);
    spawner.children[0]?.emitError();

    expect(await result).toBe('success');
  });

  test('起動中に操作がキャンセルされた場合は起動した子プロセスへ終了要求を送る', () => {
    const spawner = createFakeSpawner(),
      started: { operation?: Operation } = {},
      spawnChild: SpawnChild = (...parameters) => {
        const child = spawner.spawnChild(...parameters);

        started.operation?.cancel();
        return child;
      },
      tracker = createOperationTracker(spawnChild),
      operation = startOperation(tracker);

    started.operation = operation;

    expect(tracker.spawnTracked(operation, COMMAND, [])).toEqual({ result: 'cancelled' });
    expect(spawner.children[0]?.signals).toEqual(['SIGTERM']);
    expect(tracker.activeChildCount()).toBe(1);
  });

  test('子プロセスのerrorイベントは結果を待たない場合も未処理にしない', () => {
    const { spawner, tracker } = createTracker(),
      spawned = tracker.spawnTracked(startOperation(tracker), COMMAND, []);

    expect(spawned.result).toBe('success');
    expect(() => {
      spawner.children[0]?.emitError();
    }).not.toThrow();
  });
});

describe('操作のキャンセル', () => {
  test('解除した処理はキャンセル時に呼ばない', () => {
    const { tracker } = createTracker(),
      operation = startOperation(tracker),
      calls: string[] = [],
      unregister = operation.onCancel(() => {
        calls.push('removed');
      });

    operation.onCancel(() => {
      calls.push('kept');
    });
    unregister();
    operation.cancel();

    expect(calls).toEqual(['kept']);
    expect(operation.isCancelled()).toBe(true);
  });

  test('キャンセル時の処理が例外を投げても残りの処理を呼ぶ', () => {
    const { tracker } = createTracker(),
      operation = startOperation(tracker),
      calls: string[] = [];

    operation.onCancel(() => {
      throw new Error('failed');
    });
    operation.onCancel(() => {
      calls.push('second');
    });

    expect(() => {
      operation.cancel();
    }).not.toThrow();
    expect(calls).toEqual(['second']);
  });

  test('キャンセル済みの操作へ登録した処理の解除関数は何もしない', () => {
    const { tracker } = createTracker(),
      operation = startOperation(tracker);

    operation.cancel();

    expect(() => {
      operation.onCancel(() => {
        // 登録時に呼ばれます。
      })();
    }).not.toThrow();
  });

  test('操作は完了通知かどうかを保持する', () => {
    const { tracker } = createTracker();

    expect(startOperation(tracker, true).completionNotice).toBe(true);
    expect(startOperation(tracker, false).completionNotice).toBe(false);
  });

  test('完了終了中は完了通知の操作だけを継続可能とする', () => {
    const { tracker } = createTracker(),
      notice = startOperation(tracker, true),
      other = startOperation(tracker, false);

    void tracker.shutdown({ complete: true });

    expect(tracker.isOperationCancelled(notice)).toBe(false);
    expect(tracker.isOperationCancelled(other)).toBe(true);
  });

  test('shutdown開始後の操作の開始はundefinedを返し、処理を実行しない', async () => {
    const { tracker } = createTracker(),
      run = vi.fn<() => Promise<void>>(() => Promise.resolve());

    await tracker.shutdown({ complete: false });

    expect(tracker.startOperation(true, run)).toBeUndefined();
    expect(run).not.toHaveBeenCalled();
  });
});

describe('操作の追跡', () => {
  test('失敗した操作は呼び出し元へ伝えず、確定後は完了通知の猶予の対象にしない', async () => {
    const { tracker } = createTracker();
    let shutdownFinished = false;

    tracker.startOperation(true, () => Promise.reject(new Error('failed')));
    await flush();
    void tracker.shutdown({ complete: true }).then(() => {
      shutdownFinished = true;
    });
    await flush();

    expect(shutdownFinished).toBe(true);
  });

  test('終了要求の送信が失敗しても、他の子プロセスへの終了要求を続ける', async () => {
    const spawner = createFakeSpawner(),
      spawnChild: SpawnChild = (...parameters) => {
        const child = spawner.spawnChild(...parameters);

        if (spawner.children.length === 1) {
          return {
            ...child,
            kill: () => {
              throw new Error('ESRCH');
            },
          };
        }

        return child;
      },
      tracker = createOperationTracker(spawnChild),
      operation = startOperation(tracker);

    tracker.spawnTracked(operation, COMMAND, ['first']);
    tracker.spawnTracked(operation, COMMAND, ['second']);

    await tracker.shutdown({ complete: false });

    expect(spawner.children[1]?.signals).toEqual(['SIGTERM']);
  });

  test('子プロセスがなければ段階的な強制終了を行わない', async () => {
    const { tracker } = createTracker();

    await tracker.shutdown({ complete: false });

    expect(vi.getTimerCount()).toBe(0);
  });

  test('打ち切り後の強制終了の予定はshutdownの段階的な終了に置き換える', async () => {
    const { spawner, start, tracker } = createTracker();

    start('work');
    await vi.advanceTimersByTimeAsync(PLAYER_TIMEOUT_MS);

    expect(spawner.children[0]?.signals).toEqual(['SIGTERM']);

    await tracker.shutdown({ complete: false });
    await vi.advanceTimersByTimeAsync(FORCE_KILL_DELAY_MS);

    // 打ち切りのSIGTERM、shutdownのSIGTERM、500ms後のSIGKILLだけを送る
    expect(spawner.children[0]?.signals).toEqual(['SIGTERM', 'SIGTERM', 'SIGKILL']);
  });

  test('すべての子プロセスが終了したら段階的な強制終了の予定を解除する', async () => {
    const { spawner, tracker } = createTracker(),
      operation = startOperation(tracker);

    tracker.spawnTracked(operation, COMMAND, ['first']);
    tracker.spawnTracked(operation, COMMAND, ['second']);
    await tracker.shutdown({ complete: false });
    spawner.children[0]?.emitClose(null, 'SIGTERM');

    expect(vi.getTimerCount()).toBe(2);

    spawner.children[1]?.emitClose(null, 'SIGTERM');

    expect(vi.getTimerCount()).toBe(0);
  });
});

/** 実際の子プロセスを起動し、終了コードとシグナルを待ちます。 */
const runNode = (
  commandArguments: readonly string[],
  env: NodeJS.ProcessEnv = process.env,
): Promise<[number | null, NodeJS.Signals | null]> =>
  new Promise((resolve) => {
    spawnNodeChild(process.execPath, commandArguments, { env }).onClose((code, signal) => {
      resolve([code, signal]);
    });
  });

describe('Node.jsの子プロセス', () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  test('終了コードを通知する', async () => {
    expect(await runNode(['-e', 'process.exit(3)'])).toEqual([3, null]);
  });

  test('引数をシェルで解釈せずにそのまま渡す', async () => {
    const argument = '$(exit 1); echo x > out | & %PATH%',
      script = `process.exit(process.argv[1] === ${JSON.stringify(argument)} ? 0 : 1)`;

    expect(await runNode(['-e', script, argument])).toEqual([0, null]);
  });

  test('指定した環境変数を渡す', async () => {
    const script = "process.exit(process.env.POMOTTY_TEST === 'yes' ? 0 : 1)";

    expect(await runNode(['-e', script], { ...process.env, POMOTTY_TEST: 'yes' })).toEqual([
      0,
      null,
    ]);
  });

  test('シグナルを送って終了させられる', async () => {
    const child = spawnNodeChild(process.execPath, ['-e', 'setTimeout(() => {}, 60_000)'], {
        env: process.env,
      }),
      closed = new Promise<[number | null, NodeJS.Signals | null]>((resolve) => {
        child.onClose((code, signal) => {
          resolve([code, signal]);
        });
      });

    child.detach();
    child.kill('SIGKILL');

    expect(await closed).toEqual([null, 'SIGKILL']);
  });

  test('存在しないコマンドはerrorイベントを通知する', async () => {
    const child = spawnNodeChild('/nonexistent/pomotty-command', [], { env: process.env });

    await expect(
      new Promise<void>((resolve) => {
        child.onError(() => {
          resolve();
        });
      }),
    ).resolves.toBeUndefined();
  });
});
