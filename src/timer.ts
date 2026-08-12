import { setTimeout as waitForTimeout } from 'node:timers/promises';

type TimerPhase = 'work' | 'break';

type Wait = (durationMs: number) => Promise<void>;

type RunPomodoroCycleParameters = {
  readonly workDurationMs?: number;
  readonly breakDurationMs?: number;
  readonly wait?: Wait;
  readonly onPhaseStarted?: (phase: TimerPhase, durationMs: number) => void;
  readonly onPhaseCompleted?: (phase: TimerPhase) => void;
};

const BREAK_DURATION_MINUTES = 5,
  MILLISECONDS_PER_MINUTE = 60_000,
  WORK_DURATION_MINUTES = 25,
  /** オプション未指定時の休憩時間です。 */
  DEFAULT_BREAK_DURATION_MS = BREAK_DURATION_MINUTES * MILLISECONDS_PER_MINUTE,
  /** オプション未指定時の作業時間です。 */
  DEFAULT_WORK_DURATION_MS = WORK_DURATION_MINUTES * MILLISECONDS_PER_MINUTE,
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
