/** タイマーが実行するフェーズです。 */
type TimerPhase = 'work' | 'break';

/** タイマーが保持する状態です。 */
type TimerState = {
  /** 現在のフェーズです。 */
  readonly phase: TimerPhase;

  /** 現在のサイクル番号（1始まり）です。 */
  readonly cycle: number;

  /** 現在のフェーズの終了予定時刻（Unix ms）です。一時停止中は使いません。 */
  readonly endsAt: number;

  /** 一時停止中なら`true`です。 */
  readonly paused: boolean;

  /** 一時停止した時点の残り時間です。実行中は使いません。 */
  readonly remainingMs: number;

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

/** フェーズをskipしたときの遷移の結果です。 */
type SkipTransition = {
  /** 飛ばしたフェーズです。 */
  readonly skippedPhase: TimerPhase;

  /** 飛ばしたフェーズが最後の休憩なら`true`です。 */
  readonly final: boolean;

  /** 遷移後の状態です。 */
  readonly state: TimerState;
};

/** フェーズの位置と完了数です。 */
type PhasePosition = Pick<TimerState, 'completedPomodoros' | 'cycle' | 'phase'>;

const FIRST_CYCLE = 1,
  COUNT_INCREMENT = 1,
  NO_TIME = 0,
  /** フェーズの長さを返します。 */
  durationFor = (phase: TimerPhase, settings: TimerSettings): number => {
    if (phase === 'work') {
      return settings.workDurationMs;
    }

    return settings.breakDurationMs;
  },
  /** 指定したフェーズを`now`から所定の時間で実行する状態を作成します。 */
  startPhase = (
    { completedPomodoros, cycle, phase }: PhasePosition,
    now: number,
    settings: TimerSettings,
  ): TimerState => ({
    completedPomodoros,
    cycle,
    endsAt: now + durationFor(phase, settings),
    paused: false,
    phase,
    remainingMs: NO_TIME,
  }),
  /** 最初の作業フェーズを開始した状態を作成します。 */
  createInitialState = (settings: TimerSettings, startedAt: number): TimerState =>
    startPhase({ completedPomodoros: 0, cycle: FIRST_CYCLE, phase: 'work' }, startedAt, settings),
  /**
   * 現在のフェーズの次へ進めた状態を返します。最後の休憩なら`undefined`です。
   *
   * 作業の次は同じサイクルの休憩、休憩の次は次のサイクルの作業です。
   * 完了済みの作業数は呼び出し元が決めた値をそのまま使います。
   */
  nextPhase = (
    { completedPomodoros, cycle, phase }: PhasePosition,
    now: number,
    settings: TimerSettings,
  ): TimerState | undefined => {
    if (phase === 'work') {
      return startPhase({ completedPomodoros, cycle, phase: 'break' }, now, settings);
    }

    if (cycle < settings.loopCount) {
      return startPhase(
        { completedPomodoros, cycle: cycle + COUNT_INCREMENT, phase: 'work' },
        now,
        settings,
      );
    }

    return undefined;
  },
  /** 作業の自然終了だけを完了数へ加えます。 */
  completedPomodorosAfterTimeout = (state: TimerState): number => {
    if (state.phase === 'work') {
      return state.completedPomodoros + COUNT_INCREMENT;
    }

    return state.completedPomodoros;
  },
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
    const next = nextPhase(
      {
        completedPomodoros: completedPomodorosAfterTimeout(state),
        cycle: state.cycle,
        phase: state.phase,
      },
      now,
      settings,
    );

    if (next === undefined) {
      return { completedPhase: state.phase, final: true, state };
    }

    return { completedPhase: state.phase, final: false, state: next };
  },
  /**
   * 現在のフェーズをskipし、次の状態を返します。
   *
   * skipした作業は完了数へ加えません。一時停止中でも、次のフェーズは
   * 一時停止を引き継がず、`now`から所定の時間で実行します。
   */
  transitionFromSkip = (
    state: TimerState,
    now: number,
    settings: TimerSettings,
  ): SkipTransition => {
    const next = nextPhase(state, now, settings);

    if (next === undefined) {
      return { final: true, skippedPhase: state.phase, state };
    }

    return { final: false, skippedPhase: state.phase, state: next };
  },
  /** 一時停止中かを考慮して、`now`時点の残り時間を返します。 */
  remainingMsAt = (state: TimerState, now: number): number => {
    if (state.paused) {
      return state.remainingMs;
    }

    return Math.max(NO_TIME, state.endsAt - now);
  },
  /**
   * 一時停止と再開を切り替えます。
   *
   * 一時停止では`now`時点の残り時間を保存し、再開では`now`に残り時間を
   * 足して終了予定時刻を復元します。一時停止中は時間が経過しません。
   */
  togglePause = (state: TimerState, now: number): TimerState => {
    if (state.paused) {
      return {
        completedPomodoros: state.completedPomodoros,
        cycle: state.cycle,
        endsAt: now + state.remainingMs,
        paused: false,
        phase: state.phase,
        remainingMs: NO_TIME,
      };
    }

    return {
      completedPomodoros: state.completedPomodoros,
      cycle: state.cycle,
      endsAt: state.endsAt,
      paused: true,
      phase: state.phase,
      remainingMs: remainingMsAt(state, now),
    };
  };

export {
  createInitialState,
  durationFor,
  remainingMsAt,
  togglePause,
  transitionFromSkip,
  transitionFromTimeout,
};
export type { SkipTransition, TimeoutTransition, TimerPhase, TimerSettings, TimerState };
