import { spawn } from 'node:child_process';

/** 再生・通知操作の結果です。 */
type OperationResult = 'success' | 'failure' | 'cancelled';

/** 音・通知要求1回分の操作です。 */
type Operation = {
  /** 最後の休憩の自然終了に由来する完了通知なら`true`です。 */
  readonly completionNotice: boolean;

  /** キャンセル済みなら`true`を返します。 */
  readonly isCancelled: () => boolean;

  /** 操作をキャンセルします。何度呼んでも1回だけ処理します。 */
  readonly cancel: () => void;

  /**
   * キャンセル時の処理を登録し、登録を解除する関数を返します。
   *
   * キャンセル済みの操作へ登録した処理は、登録中に同期的に1回呼ばれます。
   */
  readonly onCancel: (callback: () => void) => () => void;
};

/** 子プロセスの終了を通知する処理です。 */
type CloseListener = (code: number | null, signal: NodeJS.Signals | null) => void;

/** 追跡対象の子プロセスです。 */
type ChildProcessHandle = {
  /** 子プロセスへシグナルを送ります。 */
  readonly kill: (signal?: NodeJS.Signals) => void;

  /** 親側の標準入出力を破棄し、イベントループから切り離します。 */
  readonly detach: () => void;

  /** プロセス終了時の処理を登録します。 */
  readonly onClose: (listener: CloseListener) => void;

  /** プロセスエラー時の処理を登録します。 */
  readonly onError: (listener: () => void) => void;
};

/** 子プロセスへ渡せるオプションです。`shell`と`stdio`は呼び出し側から指定できません。 */
type SpawnChildOptions = {
  /** 子プロセスへ渡す環境変数です。 */
  readonly env?: NodeJS.ProcessEnv;
};

/** 絶対パスのコマンドを起動する処理です。 */
type SpawnChild = (
  commandPath: string,
  commandArguments: readonly string[],
  options: SpawnChildOptions,
) => ChildProcessHandle;

/** `spawnTracked()`の結果です。 */
type SpawnTrackedResult =
  | { readonly result: 'success'; readonly child: ChildProcessHandle }
  | { readonly result: 'failure' | 'cancelled' };

/** 子プロセスと操作を追跡し、終了処理をまとめる処理です。 */
type OperationTracker = {
  /** 新しい操作を作成して追跡します。shutdown開始後は`undefined`を返します。 */
  readonly startOperation: (
    completionNotice: boolean,
    run: (operation: Operation) => Promise<unknown>,
  ) => Operation | undefined;

  /** 操作の継続可否を判定します。 */
  readonly isOperationCancelled: (operation: Operation) => boolean;

  /** 子プロセスを追跡しながら起動します。 */
  readonly spawnTracked: (
    operation: Operation,
    commandPath: string,
    commandArguments: readonly string[],
    options?: SpawnChildOptions,
  ) => SpawnTrackedResult;

  /** 子プロセスを起動し、終了または`timeoutMs`経過まで待ちます。 */
  readonly runChild: (
    operation: Operation,
    commandPath: string,
    commandArguments: readonly string[],
    options?: SpawnChildOptions & { readonly timeoutMs?: number },
  ) => Promise<OperationResult>;

  /**
   * 終了処理を開始します。
   *
   * 完了終了では完了通知操作を最大`COMPLETION_GRACE_MS`だけ待ち、それ以外では
   * すべての操作を直ちにキャンセルします。その後、追跡中の子プロセスへ
   * 段階的に終了要求を送ります。何度呼んでも同じPromiseを返します。
   */
  readonly shutdown: (options: { readonly complete: boolean }) => Promise<void>;

  /** 追跡中の子プロセス数です。 */
  readonly activeChildCount: () => number;
};

const SUCCESS_EXIT_CODE = 0,
  EMPTY_SIZE = 0,
  /** 再生コマンドを打ち切るまでの時間です。 */
  PLAYER_TIMEOUT_MS = 10_000,
  /** 打ち切り後、強制終了を要求するまでの時間です。 */
  FORCE_KILL_DELAY_MS = 1000,
  /** 完了終了で完了通知の確定を待つ上限です。 */
  COMPLETION_GRACE_MS = 3000,
  /** 段階的終了の開始から`SIGKILL`を送るまでの時間です。 */
  SIGKILL_DELAY_MS = 500,
  /** 段階的終了の開始から子プロセスを切り離すまでの時間です。 */
  DETACH_DELAY_MS = 1500,
  /** 失敗しても後続処理を止めない同期処理を実行します。 */
  bestEffort = (action: () => void): void => {
    try {
      action();
    } catch {
      // 終了済みの子プロセスへの操作など。後続処理を優先します。
    }
  },
  /** 親プロセスの終了を妨げないtimerを登録します。 */
  setUnrefTimeout = (callback: () => void, delayMs: number): NodeJS.Timeout => {
    const timer = setTimeout(callback, delayMs);

    timer.unref();
    return timer;
  },
  /** 登録済みのtimerをすべて解除します。 */
  clearTimers = (timers: Set<NodeJS.Timeout>): void => {
    for (const timer of timers) {
      clearTimeout(timer);
    }

    timers.clear();
  },
  /** Node.jsの子プロセスを`shell: false`で起動します。 */
  spawnNodeChild: SpawnChild = (commandPath, commandArguments, { env }) => {
    const child = spawn(commandPath, [...commandArguments], {
      env,
      shell: false,
      stdio: 'ignore',
      windowsHide: true,
    });

    return {
      detach: () => {
        child.stdin?.destroy();
        child.stdout?.destroy();
        child.stderr?.destroy();
        child.unref();
      },
      kill: (signal) => {
        child.kill(signal);
      },
      onClose: (listener) => {
        child.once('close', listener);
      },
      onError: (listener) => {
        child.on('error', listener);
      },
    };
  },
  /** キャンセル可能な操作を作成します。 */
  createOperation = (completionNotice: boolean): Operation => {
    const callbacks = new Set<() => void>();
    let cancelled = false;

    return {
      cancel: () => {
        if (cancelled) {
          return;
        }

        cancelled = true;

        for (const callback of callbacks) {
          bestEffort(callback);
        }

        callbacks.clear();
      },
      completionNotice,
      isCancelled: () => cancelled,
      onCancel: (callback) => {
        if (cancelled) {
          callback();
          return () => {
            // キャンセル済みのため解除する登録はありません。
          };
        }

        callbacks.add(callback);
        return () => {
          callbacks.delete(callback);
        };
      },
    };
  },
  /**
   * 再生・通知の子プロセスと操作を追跡する処理を作成します。
   *
   * @param spawnChild 子プロセスを起動する処理。テストでは偽の子プロセスを返します。
   * @returns 操作の開始、子プロセスの起動、shutdownをまとめた処理。
   */
  createOperationTracker = (spawnChild: SpawnChild = spawnNodeChild): OperationTracker => {
    const activeChildren = new Set<ChildProcessHandle>(),
      activeOperations = new Map<Operation, Promise<void>>(),
      forceKillTimers = new Set<NodeJS.Timeout>(),
      terminationTimers = new Set<NodeJS.Timeout>();
    let shuttingDown = false,
      shutdownPromise: Promise<void> | undefined;

    const isOperationCancelled = (operation: Operation): boolean =>
        operation.isCancelled() || (shuttingDown && !operation.completionNotice),
      /** 指定した時間後も終了していない子プロセスへ`SIGKILL`を1回送ります。 */
      scheduleForceKill = (child: ChildProcessHandle): void => {
        const timer = setUnrefTimeout(() => {
          forceKillTimers.delete(timer);

          if (activeChildren.has(child)) {
            bestEffort(() => {
              child.kill('SIGKILL');
            });
          }
        }, FORCE_KILL_DELAY_MS);

        forceKillTimers.add(timer);
      },
      spawnTracked: OperationTracker['spawnTracked'] = (
        operation,
        commandPath,
        commandArguments,
        options = {},
      ) => {
        if (isOperationCancelled(operation)) {
          return { result: 'cancelled' };
        }

        let child: ChildProcessHandle;

        try {
          child = spawnChild(commandPath, commandArguments, { env: options.env });
        } catch {
          return { result: 'failure' };
        }

        activeChildren.add(child);
        // 子プロセスの`error`を未処理にしないための安全リスナーです。
        child.onError(() => {
          // 結果は各試行のリスナーで確定します。
        });
        child.onClose(() => {
          activeChildren.delete(child);

          if (activeChildren.size === EMPTY_SIZE) {
            clearTimers(terminationTimers);
          }
        });

        if (isOperationCancelled(operation)) {
          bestEffort(() => {
            child.kill();
          });
          return { result: 'cancelled' };
        }

        return { child, result: 'success' };
      },
      runChild: OperationTracker['runChild'] = (
        operation,
        commandPath,
        commandArguments,
        { env, timeoutMs = PLAYER_TIMEOUT_MS } = {},
      ) =>
        new Promise<OperationResult>((resolve) => {
          if (isOperationCancelled(operation)) {
            resolve('cancelled');
            return;
          }

          const cleanups: (() => void)[] = [];
          let settled = false;

          const finish = (result: OperationResult): void => {
            if (settled) {
              return;
            }

            settled = true;

            for (const cleanup of cleanups) {
              cleanup();
            }

            if (isOperationCancelled(operation)) {
              resolve('cancelled');
            } else {
              resolve(result);
            }
          };

          cleanups.push(
            operation.onCancel(() => {
              finish('cancelled');
            }),
          );

          const spawned = spawnTracked(operation, commandPath, commandArguments, { env });

          if (spawned.result !== 'success') {
            finish(spawned.result);
            return;
          }

          const { child } = spawned;

          child.onError(() => {
            finish('failure');
          });
          child.onClose((code, signal) => {
            if (code === SUCCESS_EXIT_CODE && signal === null) {
              finish('success');
            } else {
              finish('failure');
            }
          });
          const timeout = setTimeout(() => {
            bestEffort(() => {
              child.kill();
            });
            scheduleForceKill(child);
            finish('failure');
          }, timeoutMs);

          cleanups.push(() => {
            clearTimeout(timeout);
          });
        }),
      /** 追跡中の子プロセスへ段階的に終了要求を送ります。 */
      terminateChildren = (): void => {
        clearTimers(forceKillTimers);

        if (activeChildren.size === EMPTY_SIZE) {
          return;
        }

        for (const child of activeChildren) {
          bestEffort(() => {
            child.kill();
          });
        }

        terminationTimers.add(
          setUnrefTimeout(() => {
            for (const child of activeChildren) {
              bestEffort(() => {
                child.kill('SIGKILL');
              });
            }
          }, SIGKILL_DELAY_MS),
        );
        terminationTimers.add(
          setUnrefTimeout(() => {
            for (const child of activeChildren) {
              bestEffort(() => {
                child.detach();
              });
            }
          }, DETACH_DELAY_MS),
        );
      },
      /** 完了通知操作の確定を上限付きで待ちます。 */
      waitForCompletionNotices = (): Promise<void> => {
        const pending = [...activeOperations]
          .filter(([operation]) => operation.completionNotice)
          .map(([, promise]) => promise);

        if (pending.length === EMPTY_SIZE) {
          return Promise.resolve();
        }

        return new Promise((resolve) => {
          const timer = setUnrefTimeout(resolve, COMPLETION_GRACE_MS);

          void Promise.all(pending).then(() => {
            clearTimeout(timer);
            resolve();
          });
        });
      },
      cancelOperations = (filter: (operation: Operation) => boolean): void => {
        for (const operation of activeOperations.keys()) {
          if (filter(operation)) {
            operation.cancel();
          }
        }
      };

    return {
      activeChildCount: () => activeChildren.size,
      isOperationCancelled,
      runChild,
      shutdown: ({ complete }) => {
        if (shutdownPromise) {
          return shutdownPromise;
        }

        shuttingDown = true;
        cancelOperations((operation) => !complete || !operation.completionNotice);

        let grace = Promise.resolve();

        if (complete) {
          grace = waitForCompletionNotices();
        }

        shutdownPromise = grace.then(() => {
          cancelOperations(() => true);
          terminateChildren();
        });
        return shutdownPromise;
      },
      spawnTracked,
      startOperation: (completionNotice, run) => {
        if (shuttingDown) {
          return;
        }

        const operation = createOperation(completionNotice),
          promise = run(operation)
            .then(() => {
              // 結果は操作ごとの処理で扱います。
            })
            .catch(() => {
              // 再生・通知の失敗はタイマーの進行に影響させません。
            })
            .finally(() => {
              activeOperations.delete(operation);
            });

        activeOperations.set(operation, promise);
        return operation;
      },
    };
  };

export {
  COMPLETION_GRACE_MS,
  DETACH_DELAY_MS,
  FORCE_KILL_DELAY_MS,
  PLAYER_TIMEOUT_MS,
  SIGKILL_DELAY_MS,
  createOperationTracker,
  spawnNodeChild,
};
export type {
  ChildProcessHandle,
  CloseListener,
  Operation,
  OperationResult,
  OperationTracker,
  SpawnChild,
  SpawnChildOptions,
  SpawnTrackedResult,
};
