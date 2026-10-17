import type { OutputStream, WriteOutput } from '#src/terminal/output.ts';
import type { TimerPhase, TimerSettings, TimerState } from '#src/timer/timer.ts';
import { isColorEnabled, stringifyFrameLine } from '#src/terminal/frame-line.ts';
import { MILLISECONDS_PER_MINUTE } from '#src/timer/timer.ts';
import type { SelectionInput } from '#src/terminal/input.ts';
import { createInlineRenderer } from '#src/terminal/inline-renderer.ts';
import { createTimerFrame } from '#src/terminal/timer-view.ts';
import process from 'node:process';
import { watchInterruptKey } from '#src/terminal/interrupt-key.ts';

/** タイマーの進行を出力する処理です。 */
type TimerView = {
  /** フェーズ開始時に呼び出します。 */
  readonly onPhaseStarted: (phase: TimerPhase, durationMs: number) => void;

  /** フェーズが自然終了したときに呼び出します。 */
  readonly onPhaseCompleted: (phase: TimerPhase) => void;

  /** 現在の状態を描画できる時点ごとに呼び出します。 */
  readonly onTick?: (state: TimerState, now: number) => void;

  /** 監視していた入力とイベントを解除します。 */
  readonly finish: () => void;
};

/** タイマーの進行の表示を作成するときの値です。 */
type ProgressViewParameters = {
  /** 画面に色を付けるかを示します。省略時は`NO_COLOR`から判定します。 */
  readonly color?: boolean;

  /**
   * 残り時間の画面を同じ位置へ描き直し、Ctrl+Cをキー操作として扱うかを示します。
   *
   * 省略時は標準入出力がどちらもTTYで、`TERM`が`dumb`でない場合に有効にします。
   */
  readonly interactive?: boolean;

  /** Ctrl+Cが押されたときに呼び出す処理です。 */
  readonly onInterrupt: () => void;

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
  'color' | 'interactive' | 'stdout'
> & {
  /** 画面に色を付けるかを示します。 */
  readonly color: boolean;

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
   * 各tickで画面を生成し、内容が変わった場合だけ書き込みます。フェーズの完了は
   * 画面を消してから1行で残し、次の画面をその下へ描画します。端末幅が変わった
   * 場合は、折り返された可能性のある旧画面を消さずに新しい画面を追記します。
   */
  createInteractiveView = ({
    color,
    onInterrupt,
    settings,
    stdin,
    terminal,
    write,
  }: InteractiveViewParameters): TimerView => {
    const renderer = createInlineRenderer(write);
    let latest: { readonly now: number; readonly state: TimerState } | undefined;

    const draw = (): void => {
        if (latest === undefined) {
          return;
        }

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
      stopWatchingKeys = watchInterruptKey({ input: stdin, onInterrupt });

    terminal.on('resize', handleResize);

    return {
      finish: () => {
        stopWatchingKeys();
        terminal.off?.('resize', handleResize);
      },
      onPhaseCompleted: (phase) => {
        renderer.log(createPhaseCompletedOutput(phase));
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
    onInterrupt,
    settings,
    stdin = process.stdin,
    stdout = process.stdout,
    write,
  }: ProgressViewParameters): TimerView => {
    if (!(interactive ?? isInteractiveTerminal(stdin, stdout))) {
      return createLineView(write);
    }

    return createInteractiveView({ color, onInterrupt, settings, stdin, terminal: stdout, write });
  };

export { createProgressView };
export type { ProgressViewParameters, TimerView };
