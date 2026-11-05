import type { TimerPhase, TimerSettings, TimerState } from './state.ts';
import {
  createInitialState,
  durationFor,
  togglePause,
  transitionFromSkip,
  transitionFromTimeout,
} from './state.ts';
import { setTimeout as sleepFor } from 'node:timers/promises';

/**
 * 指定したミリ秒だけ待機する処理です。
 *
 * 経過時間の情報源ではなく、終了予定時刻と現在時刻を比較するきっかけとしてだけ使います。
 */
type Sleep = (durationMs: number, signal?: AbortSignal) => Promise<void>;

/** 現在の壁時計時刻（Unix ms）を返す処理です。 */
type Now = () => number;

/** フェーズ完了時に通知する付加情報です。 */
type PhaseCompletion = {
  /** 最後のサイクルの休憩が完了し、タイマーを終了する場合は`true`です。 */
  readonly final: boolean;
};

/**
 * 実行中のタイマーを操作する処理です。
 *
 * どの操作も、まず現在時刻で期限到達済みのフェーズを自然終了として精算し、
 * その後のフェーズへ操作を適用します。精算で最後の休憩が完了した場合は
 * 操作を適用しません。タイマーの終了後や中断後は何もしません。
 */
type TimerControls = {
  /** 一時停止と再開を切り替えます。 */
  readonly togglePause: () => void;

  /** 現在のフェーズをskipします。最後の休憩をskipするとタイマーを完了します。 */
  readonly skip: () => void;

  /**
   * 期限到達済みのフェーズだけを精算します。
   *
   * 終了操作の前に呼び出します。タイマーが完了した場合は`true`を返します。
   */
  readonly settle: () => boolean;
};

/** タイマーの実行結果です。 */
type TimerResult = {
  /** 最後の休憩まで完了した場合は`true`、中断した場合は`false`です。 */
  readonly completed: boolean;

  /** 自然終了した作業フェーズの数です。 */
  readonly completedPomodoros: number;
};

/** タイマーの実行条件と通知処理です。 */
type RunPomodoroTimerParameters = Partial<Omit<TimerSettings, 'loopCount'>> & {
  /** 作業と休憩の組を繰り返す回数です。 */
  readonly loopCount: number;

  /** 現在時刻を返す処理です。 */
  readonly now?: Now;

  /** 次のtickまで待機する処理です。 */
  readonly sleep?: Sleep;

  /** 中断を通知するシグナルです。 */
  readonly signal?: AbortSignal;

  /** フェーズ開始時に呼び出す処理です。 */
  readonly onPhaseStarted?: (phase: TimerPhase, durationMs: number) => void;

  /** フェーズが自然終了したときに呼び出す処理です。 */
  readonly onPhaseCompleted?: (phase: TimerPhase, completion: PhaseCompletion) => void;

  /** フェーズをskipしたときに呼び出す処理です。 */
  readonly onPhaseSkipped?: (phase: TimerPhase) => void;

  /** 開始時に、実行中のタイマーを操作する処理を受け取ります。 */
  readonly bindControls?: (controls: TimerControls) => void;

  /**
   * 現在の状態を描画できる時点ごとに呼び出す処理です。
   *
   * 最初のフェーズ開始直後、タイマーを終了しない各tickの後、操作の直後に呼び出します。
   * `now`は状態の判定に使った時刻で、残り時間の算出に使えます。
   */
  readonly onTick?: (state: TimerState, now: number) => void;
};

const DEFAULT_BREAK_DURATION_MINUTES = 5,
  /** 1分あたりのミリ秒数です。 */
  MILLISECONDS_PER_MINUTE = 60_000,
  DEFAULT_WORK_DURATION_MINUTES = 15,
  /** オプション未指定時の休憩時間です。 */
  DEFAULT_BREAK_DURATION_MS = DEFAULT_BREAK_DURATION_MINUTES * MILLISECONDS_PER_MINUTE,
  /** オプション未指定時の作業時間です。 */
  DEFAULT_WORK_DURATION_MS = DEFAULT_WORK_DURATION_MINUTES * MILLISECONDS_PER_MINUTE,
  /** 終了予定時刻と現在時刻を比較する間隔です。 */
  TICK_INTERVAL_MS = 250,
  /** 実時間を使う既定の待機処理です。 */
  sleepWithTimer: Sleep = (durationMs, signal) => sleepFor(durationMs, undefined, { signal }),
  /** 外部からの中断と、タイマー内部の終了のどちらかで中断されるシグナルを作成します。 */
  combineSignals = (signal: AbortSignal | undefined, internal: AbortSignal): AbortSignal => {
    if (signal === undefined) {
      return internal;
    }

    return AbortSignal.any([signal, internal]);
  },
  /** 次のtickまで待機し、中断された場合は`false`を返します。 */
  waitForTick = async (sleep: Sleep, signal: AbortSignal | undefined): Promise<boolean> => {
    if (signal?.aborted) {
      return false;
    }

    try {
      await sleep(TICK_INTERVAL_MS, signal);
    } catch (error) {
      if (signal?.aborted) {
        return false;
      }

      throw error;
    }

    return signal?.aborted !== true;
  },
  /**
   * 作業と休憩を指定回数だけ繰り返します。
   *
   * 各フェーズの終了予定時刻を壁時計の絶対値で保持し、250msごとに現在時刻と
   * 比較します。待機処理を経過時間の情報源にしないため、OSのスリープ中に
   * 待機用のtimerが止まっても、復帰後の最初のtickでフェーズの終了を検知します。
   * 一時停止中は期限を判定せず、時間を経過させません。
   */
  runPomodoroTimer = async ({
    workDurationMs = DEFAULT_WORK_DURATION_MS,
    breakDurationMs = DEFAULT_BREAK_DURATION_MS,
    loopCount,
    now = Date.now,
    sleep = sleepWithTimer,
    signal,
    onPhaseStarted,
    onPhaseCompleted,
    onPhaseSkipped,
    onTick,
    bindControls,
  }: RunPomodoroTimerParameters): Promise<TimerResult> => {
    const settings = { breakDurationMs, loopCount, workDurationMs },
      startedAt = now(),
      finishController = new AbortController(),
      tickSignal = combineSignals(signal, finishController.signal);
    let state = createInitialState(settings, startedAt),
      finished = false;

    /** 最後の休憩の終了でタイマーを完了し、待機中のtickを打ち切ります。 */
    const finish = (): void => {
        finished = true;
        finishController.abort();
      },
      notifyStarted = (): void => {
        onPhaseStarted?.(state.phase, durationFor(state.phase, settings));
      },
      /** 期限到達済みのフェーズを1回だけ自然終了させます。タイマーが完了したら`true`です。 */
      settleExpiredPhase = (currentTime: number): boolean => {
        if (finished || state.paused || currentTime < state.endsAt) {
          return finished;
        }

        const transition = transitionFromTimeout(state, currentTime, settings);

        ({ state } = transition);
        onPhaseCompleted?.(transition.completedPhase, { final: transition.final });

        if (transition.final) {
          finish();
          return true;
        }

        notifyStarted();
        return false;
      },
      /** 期限を精算してから操作を適用し、変化した状態を通知します。 */
      applyManualAction = (action: (currentTime: number) => void): boolean => {
        if (finished || tickSignal.aborted) {
          return finished;
        }

        const currentTime = now();

        if (settleExpiredPhase(currentTime)) {
          return true;
        }

        action(currentTime);

        if (!finished) {
          onTick?.(state, currentTime);
        }

        return finished;
      };

    bindControls?.({
      settle: () =>
        applyManualAction(() => {
          // 期限の精算だけを行います。
        }),
      skip: () => {
        applyManualAction((currentTime) => {
          const transition = transitionFromSkip(state, currentTime, settings);

          ({ state } = transition);
          onPhaseSkipped?.(transition.skippedPhase);

          if (transition.final) {
            finish();
            return;
          }

          notifyStarted();
        });
      },
      togglePause: () => {
        applyManualAction((currentTime) => {
          state = togglePause(state, currentTime);
        });
      },
    });

    notifyStarted();
    onTick?.(state, startedAt);

    for (;;) {
      // 各tickを順番に待機するため、ループ内でawaitします。
      // oxlint-disable-next-line no-await-in-loop
      if (!(await waitForTick(sleep, tickSignal))) {
        return { completed: finished, completedPomodoros: state.completedPomodoros };
      }

      const currentTime = now();

      if (settleExpiredPhase(currentTime)) {
        return { completed: true, completedPomodoros: state.completedPomodoros };
      }

      onTick?.(state, currentTime);
    }
  };

export {
  DEFAULT_BREAK_DURATION_MINUTES,
  DEFAULT_BREAK_DURATION_MS,
  DEFAULT_WORK_DURATION_MINUTES,
  DEFAULT_WORK_DURATION_MS,
  MILLISECONDS_PER_MINUTE,
  TICK_INTERVAL_MS,
  runPomodoroTimer,
};
export type { Now, PhaseCompletion, RunPomodoroTimerParameters, Sleep, TimerControls, TimerResult };
