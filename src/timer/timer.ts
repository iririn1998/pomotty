import { setTimeout as waitForTimeout } from 'node:timers/promises';

/** タイマーが実行するフェーズです。 */
type TimerPhase = 'work' | 'break';

/** 指定したミリ秒だけ待機する処理です。 */
type Wait = (durationMs: number) => Promise<void>;

/** ポモドーロサイクルの実行条件と通知処理です。 */
type RunPomodoroCycleParameters = {
  /** 作業フェーズの長さです。 */
  readonly workDurationMs?: number;

  /** 休憩フェーズの長さです。 */
  readonly breakDurationMs?: number;

  /** 各フェーズで使用する待機処理です。 */
  readonly wait?: Wait;

  /** フェーズ開始時に呼び出す処理です。 */
  readonly onPhaseStarted?: (phase: TimerPhase, durationMs: number) => void;

  /** フェーズ完了時に呼び出す処理です。 */
  readonly onPhaseCompleted?: (phase: TimerPhase) => void;
};

const BREAK_DURATION_MINUTES = 5,
  /** 1分あたりのミリ秒数です。 */
  MILLISECONDS_PER_MINUTE = 60_000,
  WORK_DURATION_MINUTES = 25,
  /** オプション未指定時の休憩時間です。 */
  DEFAULT_BREAK_DURATION_MS = BREAK_DURATION_MINUTES * MILLISECONDS_PER_MINUTE,
  /** オプション未指定時の作業時間です。 */
  DEFAULT_WORK_DURATION_MS = WORK_DURATION_MINUTES * MILLISECONDS_PER_MINUTE,
  /** 実時間を使う既定の待機処理です。 */
  waitFor: Wait = (durationMs) => waitForTimeout(durationMs),
  /**
   * 作業と休憩を1回ずつ実行します。
   *
   * 待機処理を注入できるため、テストでは実時間を待たずに確認できます。
   */
  runPomodoroCycle = async ({
    workDurationMs = DEFAULT_WORK_DURATION_MS,
    breakDurationMs = DEFAULT_BREAK_DURATION_MS,
    wait = waitFor,
    onPhaseStarted,
    onPhaseCompleted,
  }: RunPomodoroCycleParameters = {}): Promise<void> => {
    if (onPhaseStarted) {
      onPhaseStarted('work', workDurationMs);
    }

    await wait(workDurationMs);

    if (onPhaseCompleted) {
      onPhaseCompleted('work');
    }

    if (onPhaseStarted) {
      onPhaseStarted('break', breakDurationMs);
    }

    await wait(breakDurationMs);

    if (onPhaseCompleted) {
      onPhaseCompleted('break');
    }
  };

export {
  DEFAULT_BREAK_DURATION_MS,
  DEFAULT_WORK_DURATION_MS,
  MILLISECONDS_PER_MINUTE,
  runPomodoroCycle,
};
export type { RunPomodoroCycleParameters, TimerPhase, Wait };
