import { setTimeout as sleepFor } from 'node:timers/promises';

/** タイマーが実行するフェーズです。 */
type TimerPhase = 'work' | 'break';

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

/** タイマーが保持する実行中の状態です。 */
type TimerState = {
  /** 現在のフェーズです。 */
  readonly phase: TimerPhase;

  /** 現在のサイクル番号（1始まり）です。 */
  readonly cycle: number;

  /** 現在のフェーズの終了予定時刻（Unix ms）です。 */
  readonly endsAt: number;

  /** 自然終了した作業フェーズの数です。 */
  readonly completedPomodoros: number;
};

/** タイマーの実行条件です。 */
type TimerSettings = {
  /** 作業フェーズの長さです。 */
  readonly workDurationMs: number;

  /** 休憩フェーズの長さです。 */
  readonly breakDurationMs: number;

  /** 作業と休憩の組を繰り返す回数です。 */
  readonly loopCount: number;
};

/** 期限到達によるフェーズ遷移の結果です。 */
type TimeoutTransition = {
  /** 完了したフェーズです。 */
  readonly completedPhase: TimerPhase;

  /** 完了したフェーズが最後の休憩なら`true`です。 */
  readonly final: boolean;

  /** 遷移後の状態です。完了済みの作業数を最終値として保持します。 */
  readonly state: TimerState;
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
};

const DEFAULT_BREAK_DURATION_MINUTES = 5,
  /** 1分あたりのミリ秒数です。 */
  MILLISECONDS_PER_MINUTE = 60_000,
  DEFAULT_WORK_DURATION_MINUTES = 15,
  /** オプション未指定時の休憩時間です。 */
  DEFAULT_BREAK_DURATION_MS = DEFAULT_BREAK_DURATION_MINUTES * MILLISECONDS_PER_MINUTE,
  /** オプション未指定時の作業時間です。 */
  DEFAULT_WORK_DURATION_MS = DEFAULT_WORK_DURATION_MINUTES * MILLISECONDS_PER_MINUTE,
  FIRST_CYCLE = 1,
  COUNT_INCREMENT = 1,
  /** 終了予定時刻と現在時刻を比較する間隔です。 */
  TICK_INTERVAL_MS = 250,
  /** 実時間を使う既定の待機処理です。 */
  sleepWithTimer: Sleep = (durationMs, signal) => sleepFor(durationMs, undefined, { signal }),
  /** 最初の作業フェーズを開始した状態を作成します。 */
  createInitialState = (settings: TimerSettings, startedAt: number): TimerState => ({
    completedPomodoros: 0,
    cycle: FIRST_CYCLE,
    endsAt: startedAt + settings.workDurationMs,
    phase: 'work',
  }),
  /**
   * 終了予定時刻を過ぎたフェーズを1回だけ完了させ、次の状態を返します。
   *
   * スリープなどで複数フェーズ分の時間が経過していても、遡って
   * 複数回遷移させません。次フェーズの終了予定時刻は渡された`now`を
   * 起点にするため、処理中に時刻を再取得しません。
   */
  transitionFromTimeout = (
    state: TimerState,
    now: number,
    settings: TimerSettings,
  ): TimeoutTransition => {
    if (state.phase === 'work') {
      return {
        completedPhase: 'work',
        final: false,
        state: {
          completedPomodoros: state.completedPomodoros + COUNT_INCREMENT,
          cycle: state.cycle,
          endsAt: now + settings.breakDurationMs,
          phase: 'break',
        },
      };
    }

    if (state.cycle < settings.loopCount) {
      return {
        completedPhase: 'break',
        final: false,
        state: {
          completedPomodoros: state.completedPomodoros,
          cycle: state.cycle + COUNT_INCREMENT,
          endsAt: now + settings.workDurationMs,
          phase: 'work',
        },
      };
    }

    return { completedPhase: 'break', final: true, state };
  },
  /** 現在のフェーズの長さを返します。 */
  durationFor = (phase: TimerPhase, settings: TimerSettings): number => {
    if (phase === 'work') {
      return settings.workDurationMs;
    }

    return settings.breakDurationMs;
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
  }: RunPomodoroTimerParameters): Promise<TimerResult> => {
    const settings = { breakDurationMs, loopCount, workDurationMs };
    let state = createInitialState(settings, now());

    onPhaseStarted?.(state.phase, durationFor(state.phase, settings));

    for (;;) {
      // 各tickを順番に待機するため、ループ内でawaitします。
      // oxlint-disable-next-line no-await-in-loop
      if (!(await waitForTick(sleep, signal))) {
        return { completed: false, completedPomodoros: state.completedPomodoros };
      }

      const currentTime = now();

      if (currentTime >= state.endsAt) {
        const transition = transitionFromTimeout(state, currentTime, settings);

        ({ state } = transition);
        onPhaseCompleted?.(transition.completedPhase, { final: transition.final });

        if (transition.final) {
          return { completed: true, completedPomodoros: state.completedPomodoros };
        }

        onPhaseStarted?.(state.phase, durationFor(state.phase, settings));
      }
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
  transitionFromTimeout,
};
export type {
  Now,
  PhaseCompletion,
  RunPomodoroTimerParameters,
  Sleep,
  TimerPhase,
  TimerResult,
  TimerSettings,
  TimerState,
};
