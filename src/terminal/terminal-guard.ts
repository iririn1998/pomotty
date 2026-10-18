import type { OutputStream, WriteOutput } from './output.ts';
import { writeSync } from 'node:fs';

/** 端末の状態を戻してから終了するために捕捉するシグナルです。 */
type TerminationSignal = 'SIGHUP' | 'SIGINT' | 'SIGTERM';

/** プロセスのイベントを登録・解除する処理です。 */
type ProcessEvents = {
  /** リスナーを登録します。 */
  readonly on: (event: 'exit' | TerminationSignal, listener: () => void) => unknown;

  /** リスナーを解除します。 */
  readonly off: (event: 'exit' | TerminationSignal, listener: () => void) => unknown;
};

/** 画面の表示中に変更した端末の状態を管理する処理です。 */
type TerminalGuard = {
  /** カーソルを隠します。2回目以降は何もしません。 */
  readonly hideCursor: () => void;

  /** 隠したカーソルを表示し、登録したリスナーを解除します。2回目以降は何もしません。 */
  readonly release: () => void;
};

/** 端末の状態を管理するときの値です。 */
type TerminalGuardParameters = {
  /** シグナルを受け取ったときに呼び出す処理です。 */
  readonly onSignal: (signal: TerminationSignal) => void;

  /** 終了とシグナルのイベントを登録するプロセスです。 */
  readonly processEvents: ProcessEvents;

  /** カーソルを操作する端末です。 */
  readonly terminal: OutputStream;

  /** 標準出力へ書き込む処理です。 */
  readonly write: WriteOutput;
};

const HIDE_CURSOR = '\u001B[?25l',
  SHOW_CURSOR = '\u001B[?25h',
  TERMINATION_SIGNALS: readonly TerminationSignal[] = ['SIGHUP', 'SIGINT', 'SIGTERM'],
  /**
   * 隠したカーソルを同期的に表示し直す処理を作成します。
   *
   * 通常の終了処理を経ずにプロセスが終了する場合の保険として`exit`イベントで
   * 使うため、非同期の書き込みではなくファイル記述子へ直接書き込みます。
   */
  createSyncCursorRestorer =
    (terminal: OutputStream): (() => void) =>
    () => {
      if (terminal.fd === undefined) {
        return;
      }

      try {
        writeSync(terminal.fd, SHOW_CURSOR);
      } catch {
        // 端末が閉じている場合は戻せないため、何もしません。
      }
    },
  /**
   * 画面の表示中に変更した端末の状態を管理します。
   *
   * 作成時にSIGHUP、SIGINT、SIGTERMのリスナーを登録し、既定動作で即座に
   * 終了する代わりに`onSignal`を呼び出して、通常の終了処理で端末を戻せる
   * ようにします。カーソルを隠している間は`exit`イベントでも同期的に表示し直します。
   */
  createTerminalGuard = ({
    onSignal,
    processEvents,
    terminal,
    write,
  }: TerminalGuardParameters): TerminalGuard => {
    const restoreCursorSync = createSyncCursorRestorer(terminal),
      signalHandlers = TERMINATION_SIGNALS.map((signal) => {
        const handler = (): void => {
          onSignal(signal);
        };

        processEvents.on(signal, handler);
        return [signal, handler] as const;
      });
    let cursorHidden = false,
      released = false;

    return {
      hideCursor: () => {
        if (cursorHidden || released) {
          return;
        }

        cursorHidden = true;
        processEvents.on('exit', restoreCursorSync);
        write(HIDE_CURSOR);
      },
      release: () => {
        if (released) {
          return;
        }

        released = true;

        for (const [signal, handler] of signalHandlers) {
          processEvents.off(signal, handler);
        }

        if (cursorHidden) {
          write(SHOW_CURSOR);
          processEvents.off('exit', restoreCursorSync);
        }
      },
    };
  };

export { createTerminalGuard };
export type { ProcessEvents, TerminalGuard, TerminationSignal };
