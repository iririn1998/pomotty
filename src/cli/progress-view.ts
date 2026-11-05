import type { OutputStream, WriteOutput } from '#src/terminal/output.ts';
import type { ProcessEvents, TerminationSignal } from '#src/terminal/terminal-guard.ts';
import type { TimerPhase, TimerSettings, TimerState } from '#src/timer/state.ts';
import { isColorEnabled, stringifyFrameLine } from '#src/terminal/frame-line.ts';
import { MILLISECONDS_PER_MINUTE } from '#src/timer/timer.ts';
import type { SelectionInput } from '#src/terminal/input.ts';
import type { TimerControls } from '#src/timer/timer.ts';
import type { TimerKey } from '#src/terminal/timer-keys.ts';
import { createInlineRenderer } from '#src/terminal/inline-renderer.ts';
import { createTerminalGuard } from '#src/terminal/terminal-guard.ts';
import { createTimerFrame } from '#src/terminal/timer-view.ts';
import process from 'node:process';
import { watchTimerKeys } from '#src/terminal/timer-keys.ts';

/** タイマーの進行を出力する処理です。 */
type TimerView = {
  /** フェーズ開始時に呼び出します。 */
  readonly onPhaseStarted: (phase: TimerPhase, durationMs: number) => void;

  /** フェーズが自然終了したときに呼び出します。 */
  readonly onPhaseCompleted: (phase: TimerPhase) => void;

  /** フェーズをskipしたときに呼び出します。 */
  readonly onPhaseSkipped?: (phase: TimerPhase) => void;

  /** 現在の状態を描画できる時点ごとに呼び出します。 */
  readonly onTick?: (state: TimerState, now: number) => void;

  /** キー操作で使う、実行中のタイマーを操作する処理を受け取ります。 */
  readonly bindControls?: (controls: TimerControls) => void;

  /** 監視していた入力とイベントを解除し、変更した端末の状態を元に戻します。 */
  readonly finish: () => void;
};

/** タイマーを止める理由です。キー操作、または端末を閉じたときなどのOSシグナルです。 */
type StopReason = Exclude<TimerKey, 'skip' | 'toggle-pause'> | TerminationSignal;

/** タイマーの進行の表示を作成するときの値です。 */
type ProgressViewParameters = {
  /** 画面に色を付けるかを示します。省略時は`NO_COLOR`から判定します。 */
  readonly color?: boolean;

  /**
   * 残り時間の画面を同じ位置へ描き直し、キー操作を受け付けるかを示します。
   *
   * 省略時は標準入出力がどちらもTTYで、`TERM`が`dumb`でない場合に有効にします。
   */
  readonly interactive?: boolean;

  /**
   * タイマーを止めるときに呼び出す処理です。
   *
   * `q`とCtrl+Cでは、期限到達済みのフェーズを精算してもタイマーが完了しない
   * 場合だけ呼び出します。OSシグナルでは精算せずに呼び出します。
   */
  readonly onStop: (reason: StopReason) => void;

  /** 終了とシグナルのイベントを登録するプロセスです。 */
  readonly processEvents?: ProcessEvents;

  /** タイマーの実行条件です。 */
  readonly settings: TimerSettings;

  /** キー入力を読み取る標準入力です。 */
  readonly stdin?: SelectionInput;

  /** 列数と幅の変更を取得する標準出力です。 */
  readonly stdout?: OutputStream;

  /** 標準出力へ書き込む処理です。 */
  readonly write: WriteOutput;
};

/** 残り時間の画面を描画するときの値です。 */
type InteractiveViewParameters = Omit<
  ProgressViewParameters,
  'color' | 'interactive' | 'processEvents' | 'stdout'
> & {
  /** 画面に色を付けるかを示します。 */
  readonly color: boolean;

  /** 終了とシグナルのイベントを登録するプロセスです。 */
  readonly processEvents: ProcessEvents;

  /** 列数と幅の変更を取得する端末です。 */
  readonly terminal: OutputStream;
};

const PHASE_ICONS = { break: '☕', work: '🍅' } as const,
  PHASE_NAMES = { break: 'Break', work: 'Work' } as const,
  /** フェーズ開始メッセージを生成します。 */
  createPhaseStartedOutput = (phase: TimerPhase, durationMs: number): string => {
    const durationMinutes = durationMs / MILLISECONDS_PER_MINUTE;
    return `${PHASE_ICONS[phase]} ${PHASE_NAMES[phase]} started (${durationMinutes} min)\n`;
  },
  /** フェーズ完了メッセージを生成します。 */
  createPhaseCompletedOutput = (phase: TimerPhase): string =>
    `✅ ${PHASE_NAMES[phase]} complete.\n`,
  /** フェーズのskipメッセージを生成します。 */
  createPhaseSkippedOutput = (phase: TimerPhase): string => `⏩ ${PHASE_NAMES[phase]} skipped.\n`,
  /**
   * キー操作を実行中のタイマーへ適用します。
   *
   * 終了操作では先に期限到達済みのフェーズを精算し、それでタイマーが完了した
   * 場合は完了を優先して止めません。
   */
  applyTimerKey = (
    key: TimerKey,
    controls: TimerControls,
    onStop: (reason: StopReason) => void,
  ): void => {
    if (key === 'toggle-pause') {
      controls.togglePause();
      return;
    }

    if (key === 'skip') {
      controls.skip();
      return;
    }

    if (!controls.settle()) {
      onStop(key);
    }
  },
  /** 標準入出力がどちらも端末で、画面を描き直せるかを判定します。 */
  isInteractiveTerminal = (stdin: SelectionInput, stdout: OutputStream): boolean =>
    stdin.isTTY === true && stdout.isTTY === true && process.env.TERM !== 'dumb',
  /** フェーズの開始と完了を1行ずつ出力する表示です。 */
  createLineView = (write: WriteOutput): TimerView => ({
    finish: () => {
      // 解除する入力やイベントはありません。
    },
    onPhaseCompleted: (phase) => {
      write(createPhaseCompletedOutput(phase));
    },
    onPhaseStarted: (phase, durationMs) => {
      write(createPhaseStartedOutput(phase, durationMs));
    },
  }),
  /**
   * 残り時間の画面を同じ位置へ描き直す表示です。
   *
   * 各tickで画面を生成し、内容が変わった場合だけ書き込みます。フェーズの完了と
   * skipは画面を消してから1行で残し、次の画面をその下へ描画します。端末幅が
   * 変わった場合は、折り返された可能性のある旧画面を消さずに新しい画面を追記します。
   *
   * 画面の表示中はカーソルを隠し、space、`s`、`q`、Ctrl+Cを操作として受け付けます。
   * SIGHUP、SIGINT、SIGTERMでも`onStop`を呼び、通常の終了処理で端末を元に戻します。
   */
  createInteractiveView = ({
    color,
    onStop,
    processEvents,
    settings,
    stdin,
    terminal,
    write,
  }: InteractiveViewParameters): TimerView => {
    const renderer = createInlineRenderer(write),
      guard = createTerminalGuard({ onSignal: onStop, processEvents, terminal, write });
    let controls: TimerControls | undefined,
      latest: { readonly now: number; readonly state: TimerState } | undefined;

    const draw = (): void => {
        if (latest === undefined) {
          return;
        }

        guard.hideCursor();
        renderer.render(
          createTimerFrame({
            columns: terminal.columns,
            now: latest.now,
            settings,
            state: latest.state,
          }).map((line) => stringifyFrameLine(line, color)),
        );
      },
      handleResize = (): void => {
        renderer.release();
        draw();
      },
      stopWatchingKeys = watchTimerKeys({
        input: stdin,
        onKey: (key) => {
          if (controls !== undefined) {
            applyTimerKey(key, controls, onStop);
          }
        },
      });

    terminal.on('resize', handleResize);

    return {
      bindControls: (bound) => {
        controls = bound;
      },
      finish: () => {
        stopWatchingKeys();
        terminal.off?.('resize', handleResize);
        guard.release();
      },
      onPhaseCompleted: (phase) => {
        renderer.log(createPhaseCompletedOutput(phase));
      },
      onPhaseSkipped: (phase) => {
        renderer.log(createPhaseSkippedOutput(phase));
      },
      onPhaseStarted: () => {
        // 開始したフェーズは画面に表示します。
      },
      onTick: (state, now) => {
        latest = { now, state };
        draw();
      },
    };
  },
  /**
   * 端末の状態に応じて、タイマーの進行の表示を作成します。
   *
   * 標準入出力が端末なら残り時間の画面を描き直し、それ以外ではフェーズの
   * 開始と完了だけを1行ずつ出力します。
   */
  createProgressView = ({
    color = isColorEnabled(process.env),
    interactive,
    onStop,
    processEvents = process,
    settings,
    stdin = process.stdin,
    stdout = process.stdout,
    write,
  }: ProgressViewParameters): TimerView => {
    if (!(interactive ?? isInteractiveTerminal(stdin, stdout))) {
      return createLineView(write);
    }

    return createInteractiveView({
      color,
      onStop,
      processEvents,
      settings,
      stdin,
      terminal: stdout,
      write,
    });
  };

export { createProgressView };
export type { ProgressViewParameters, StopReason, TimerView };
