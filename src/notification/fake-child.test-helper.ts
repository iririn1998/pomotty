import type { ChildProcessHandle, CloseListener, SpawnChild } from './operation.ts';

/** テストから操作できる偽の子プロセスです。 */
type FakeChild = ChildProcessHandle & {
  /** 起動したコマンドの絶対パスです。 */
  readonly commandPath: string;

  /** 起動時の引数です。 */
  readonly commandArguments: readonly string[];

  /** 起動時の環境変数です。 */
  readonly env: NodeJS.ProcessEnv | undefined;

  /** 受け取ったシグナルの一覧です。引数なしの`kill()`は`'SIGTERM'`として記録します。 */
  readonly signals: readonly NodeJS.Signals[];

  /** `detach()`が呼ばれた場合は`true`を返します。 */
  readonly isDetached: () => boolean;

  /** `close`イベントを発生させます。 */
  readonly emitClose: (code: number | null, signal?: NodeJS.Signals | null) => void;

  /** `error`イベントを発生させます。 */
  readonly emitError: () => void;
};

/** 偽の子プロセスを起動する処理と、起動した子プロセスの一覧です。 */
type FakeSpawner = {
  readonly children: readonly FakeChild[];
  readonly spawnChild: SpawnChild;
};

/**
 * 偽の子プロセスを返す`SpawnChild`を作成します。
 *
 * @param failures 起動時に同期例外を投げるコマンドの絶対パス。
 */
const createFakeSpawner = (failures: ReadonlySet<string> = new Set()): FakeSpawner => {
  const children: FakeChild[] = [];

  return {
    children,
    spawnChild: (commandPath, commandArguments, { env }) => {
      if (failures.has(commandPath)) {
        throw new Error(`spawn ${commandPath} EACCES`);
      }

      const closeListeners: CloseListener[] = [],
        errorListeners: (() => void)[] = [],
        signals: NodeJS.Signals[] = [];
      let closed = false,
        detached = false;

      const child: FakeChild = {
        commandArguments,
        commandPath,
        detach: () => {
          detached = true;
        },
        emitClose: (code, signal = null) => {
          if (closed) {
            return;
          }

          closed = true;

          for (const listener of closeListeners) {
            listener(code, signal);
          }
        },
        emitError: () => {
          for (const listener of errorListeners) {
            listener();
          }
        },
        env,
        isDetached: () => detached,
        kill: (signal = 'SIGTERM') => {
          signals.push(signal);
        },
        onClose: (listener) => {
          closeListeners.push(listener);
        },
        onError: (listener) => {
          errorListeners.push(listener);
        },
        signals,
      };

      children.push(child);
      return child;
    },
  };
};

export { createFakeSpawner };
export type { FakeChild, FakeSpawner };
