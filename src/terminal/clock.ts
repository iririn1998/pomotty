import type { TimerPhase, TimerSettings, TimerState } from '#src/timer/state.ts';
import { remainingMsAt } from '#src/timer/state.ts';

/** 現在のフェーズの進み具合です。 */
type PhaseProgress = {
  /** 経過時間の表示秒です。 */
  readonly elapsedSeconds: number;

  /** 経過率（0〜1）です。 */
  readonly ratio: number;

  /** 切り捨てた経過率（0〜100）です。 */
  readonly percent: number;

  /** 残り時間の表示秒です。 */
  readonly remainingSeconds: number;

  /** フェーズの長さの表示秒です。 */
  readonly totalSeconds: number;
};

const MILLISECONDS_PER_SECOND = 1000,
  SECONDS_PER_MINUTE = 60,
  SECONDS_PER_HOUR = 3600,
  PERCENT = 100,
  TIME_PART_WIDTH = 2,
  NO_TIME = 0,
  MIN_RATIO = 0,
  MAX_RATIO = 1,
  /** 2桁へ0埋めします。 */
  twoDigits = (value: number): string => String(value).padStart(TIME_PART_WIDTH, '0'),
  /**
   * 表示秒を`M:SS`または`H:MM:SS`へ整形します。
   *
   * 3599秒以下は`M:SS`、3600秒以上は`H:MM:SS`とします。
   */
  formatClock = (seconds: number): string => {
    const hours = Math.floor(seconds / SECONDS_PER_HOUR),
      minutes = Math.floor((seconds % SECONDS_PER_HOUR) / SECONDS_PER_MINUTE),
      restSeconds = seconds % SECONDS_PER_MINUTE;

    if (hours === NO_TIME) {
      return `${minutes}:${twoDigits(restSeconds)}`;
    }

    return `${hours}:${twoDigits(minutes)}:${twoDigits(restSeconds)}`;
  },
  /** ミリ秒を切り上げた表示秒へ変換します。 */
  toDisplaySeconds = (milliseconds: number): number =>
    Math.ceil(milliseconds / MILLISECONDS_PER_SECOND),
  /** ミリ秒の長さを`M:SS`または`H:MM:SS`へ整形します。 */
  formatDuration = (milliseconds: number): string => formatClock(toDisplaySeconds(milliseconds)),
  /** フェーズの長さを返します。 */
  durationFor = (phase: TimerPhase, settings: TimerSettings): number => {
    if (phase === 'work') {
      return settings.workDurationMs;
    }

    return settings.breakDurationMs;
  },
  /**
   * 現在のフェーズの進み具合を求めます。
   *
   * 残り時間は`ceil(ms / 1000)`の表示秒とし、残り1msでも`0:01`と表示します。
   * 経過時間は表示上の合計と一致するよう、長さの表示秒から残りの表示秒を引きます。
   * 一時停止中は一時停止した時点の残り時間を使います。
   * 時計が戻って残り時間が長さを超えた場合も、経過率は0に留めます。
   */
  progressFor = (state: TimerState, now: number, settings: TimerSettings): PhaseProgress => {
    const durationMs = durationFor(state.phase, settings),
      remainingMs = remainingMsAt(state, now),
      ratio = Math.min(MAX_RATIO, Math.max(MIN_RATIO, (durationMs - remainingMs) / durationMs)),
      remainingSeconds = toDisplaySeconds(remainingMs),
      totalSeconds = toDisplaySeconds(durationMs);

    return {
      elapsedSeconds: Math.max(NO_TIME, totalSeconds - remainingSeconds),
      percent: Math.floor(ratio * PERCENT),
      ratio,
      remainingSeconds,
      totalSeconds,
    };
  };

export { formatClock, formatDuration, progressFor };
export type { PhaseProgress };
