import {
  DEFAULT_BREAK_DURATION_MS,
  DEFAULT_WORK_DURATION_MS,
  MILLISECONDS_PER_MINUTE,
  TICK_INTERVAL_MS,
  runPomodoroTimer,
} from './timer.ts';
import { transitionFromTimeout } from './state.ts';
import type { RunPomodoroTimerParameters, Sleep, TimerControls, TimerResult } from './timer.ts';
import { describe, expect, test } from 'vitest';

type FakeClock = {
  readonly elapsed: () => number;
  readonly now: () => number;
  readonly sleep: Sleep;
};

type TimerRun = {
  readonly elapsedMs: number;
  readonly events: readonly string[];
  readonly result: TimerResult;
};

const CUSTOM_BREAK_DURATION_MS = 1000,
  CUSTOM_WORK_DURATION_MS = 2000,
  EXPECTED_BREAK_DURATION_MINUTES = 5,
  EXPECTED_WORK_DURATION_MINUTES = 15,
  HOUR_MS = 3_600_000,
  SECOND_MS = 1000,
  START_TIME = 1_700_000_000_000,
  /**
   * 偽の時計を作成します。
   *
   * `sleep`は既定でtick間隔だけ時刻を進めます。`jumps`の各値は対応する回の
   * `sleep`でtick間隔の代わりに進める時間で、OSのスリープなどを再現します。
   */
  createFakeClock = (jumps: ReadonlyMap<number, number> = new Map()): FakeClock => {
    let currentTime = START_TIME,
      sleepCount = 0;

    return {
      elapsed: () => currentTime - START_TIME,
      now: () => currentTime,
      sleep: (durationMs) => {
        currentTime += jumps.get(sleepCount) ?? durationMs;
        sleepCount += 1;
        return Promise.resolve();
      },
    };
  },
  runTimer = async (
    parameters: Omit<RunPomodoroTimerParameters, 'now' | 'sleep'>,
    clock: FakeClock = createFakeClock(),
  ): Promise<TimerRun> => {
    const events: string[] = [],
      result = await runPomodoroTimer({
        ...parameters,
        now: clock.now,
        onPhaseCompleted: (phase, { final }) => {
          events.push(`completed:${phase}:${clock.elapsed()}${final ? ':final' : ''}`);
        },
        onPhaseStarted: (phase, durationMs) => {
          events.push(`started:${phase}:${durationMs}:${clock.elapsed()}`);
        },
        sleep: clock.sleep,
      });

    return { elapsedMs: clock.elapsed(), events, result };
  };

test('既定時間は作業15分・休憩5分である', () => {
  expect(DEFAULT_WORK_DURATION_MS).toBe(EXPECTED_WORK_DURATION_MINUTES * MILLISECONDS_PER_MINUTE);
  expect(DEFAULT_BREAK_DURATION_MS).toBe(EXPECTED_BREAK_DURATION_MINUTES * MILLISECONDS_PER_MINUTE);
});

test('loopCount = 1では作業と休憩を1回ずつ実行して終了する', async () => {
  const run = await runTimer({ loopCount: 1 });

  expect(run).toEqual({
    elapsedMs: DEFAULT_WORK_DURATION_MS + DEFAULT_BREAK_DURATION_MS,
    events: [
      `started:work:${DEFAULT_WORK_DURATION_MS}:0`,
      `completed:work:${DEFAULT_WORK_DURATION_MS}`,
      `started:break:${DEFAULT_BREAK_DURATION_MS}:${DEFAULT_WORK_DURATION_MS}`,
      `completed:break:${DEFAULT_WORK_DURATION_MS + DEFAULT_BREAK_DURATION_MS}:final`,
    ],
    result: { completed: true, completedPomodoros: 1 },
  });
});

test('loopCount = 3では最後の休憩だけを最終フェーズとして通知する', async () => {
  const run = await runTimer({
    breakDurationMs: CUSTOM_BREAK_DURATION_MS,
    loopCount: 3,
    workDurationMs: CUSTOM_WORK_DURATION_MS,
  });

  expect(run.events).toEqual([
    'started:work:2000:0',
    'completed:work:2000',
    'started:break:1000:2000',
    'completed:break:3000',
    'started:work:2000:3000',
    'completed:work:5000',
    'started:break:1000:5000',
    'completed:break:6000',
    'started:work:2000:6000',
    'completed:work:8000',
    'started:break:1000:8000',
    'completed:break:9000:final',
  ]);
  expect(run.result).toEqual({ completed: true, completedPomodoros: 3 });
});

test('スリープ復帰後は現在のフェーズを1回だけ完了し、次のフェーズを復帰時刻から開始する', async () => {
  // 1秒後に1時間のスリープが発生する。作業2秒・休憩1秒の全フェーズ分を超えるが、
  // 遡って複数フェーズを完了させず、作業だけを完了して休憩を全量で開始する。
  const sleepAfterTicks = SECOND_MS / TICK_INTERVAL_MS,
    clock = createFakeClock(new Map([[sleepAfterTicks, HOUR_MS]])),
    resumedAt = SECOND_MS + HOUR_MS,
    run = await runTimer(
      {
        breakDurationMs: CUSTOM_BREAK_DURATION_MS,
        loopCount: 2,
        workDurationMs: CUSTOM_WORK_DURATION_MS,
      },
      clock,
    );

  expect(run.events.slice(0, 4)).toEqual([
    'started:work:2000:0',
    `completed:work:${resumedAt}`,
    `started:break:1000:${resumedAt}`,
    `completed:break:${resumedAt + CUSTOM_BREAK_DURATION_MS}`,
  ]);
  expect(run.result).toEqual({ completed: true, completedPomodoros: 2 });
});

test('待機処理が遅れても経過時間を累積せず、終了予定時刻で完了を判定する', async () => {
  // 待機処理が要求より長く（1.1秒）かかっても、合計の待機回数ではなく
  // 終了予定時刻との比較で完了するため、作業2秒は2回目のtickで完了する。
  const delayedTickMs = 1100,
    jumps = new Map(Array.from({ length: 10 }, (_value, index) => [index, delayedTickMs] as const)),
    run = await runTimer(
      {
        breakDurationMs: CUSTOM_BREAK_DURATION_MS,
        loopCount: 1,
        workDurationMs: CUSTOM_WORK_DURATION_MS,
      },
      createFakeClock(jumps),
    );

  expect(run.events).toEqual([
    'started:work:2000:0',
    'completed:work:2200',
    'started:break:1000:2200',
    'completed:break:3300:final',
  ]);
});

test('終了予定時刻ちょうどでフェーズを完了する', () => {
  const settings = {
      breakDurationMs: CUSTOM_BREAK_DURATION_MS,
      loopCount: 2,
      workDurationMs: CUSTOM_WORK_DURATION_MS,
    },
    state = {
      completedPomodoros: 0,
      cycle: 1,
      endsAt: START_TIME,
      paused: false,
      phase: 'work',
      remainingMs: 0,
    } as const;

  expect(transitionFromTimeout(state, START_TIME, settings)).toEqual({
    completedPhase: 'work',
    final: false,
    state: {
      completedPomodoros: 1,
      cycle: 1,
      endsAt: START_TIME + CUSTOM_BREAK_DURATION_MS,
      paused: false,
      phase: 'break',
      remainingMs: 0,
    },
  });
});

test('最後のサイクル以外の休憩完了でサイクルを進め、作業を開始する', () => {
  const settings = {
    breakDurationMs: CUSTOM_BREAK_DURATION_MS,
    loopCount: 2,
    workDurationMs: CUSTOM_WORK_DURATION_MS,
  };

  expect(
    transitionFromTimeout(
      {
        completedPomodoros: 1,
        cycle: 1,
        endsAt: START_TIME,
        paused: false,
        phase: 'break',
        remainingMs: 0,
      },
      START_TIME,
      settings,
    ),
  ).toEqual({
    completedPhase: 'break',
    final: false,
    state: {
      completedPomodoros: 1,
      cycle: 2,
      endsAt: START_TIME + CUSTOM_WORK_DURATION_MS,
      paused: false,
      phase: 'work',
      remainingMs: 0,
    },
  });
  expect(
    transitionFromTimeout(
      {
        completedPomodoros: 2,
        cycle: 2,
        endsAt: START_TIME,
        paused: false,
        phase: 'break',
        remainingMs: 0,
      },
      START_TIME,
      settings,
    ),
  ).toMatchObject({ completedPhase: 'break', final: true });
});

test('開始直後と、終了しない各tickの後に現在の状態と判定時刻を通知する', async () => {
  const clock = createFakeClock(),
    ticks: string[] = [];

  await runPomodoroTimer({
    breakDurationMs: TICK_INTERVAL_MS,
    loopCount: 1,
    now: clock.now,
    onPhaseCompleted: (phase) => {
      ticks.push(`completed:${phase}`);
    },
    onTick: (state, now) => {
      ticks.push(`${state.phase}:${state.cycle}:${state.endsAt - now}:${now - START_TIME}`);
    },
    sleep: clock.sleep,
    workDurationMs: 2 * TICK_INTERVAL_MS,
  });

  expect(ticks).toEqual([
    'work:1:500:0',
    'work:1:250:250',
    'completed:work',
    'break:1:250:500',
    'completed:break',
  ]);
});

test('中断されるとフェーズを完了せずに終了する', async () => {
  const controller = new AbortController(),
    clock = createFakeClock(),
    events: string[] = [],
    result = await runPomodoroTimer({
      loopCount: 1,
      now: clock.now,
      onPhaseCompleted: (phase) => {
        events.push(`completed:${phase}`);
      },
      signal: controller.signal,
      sleep: (durationMs) => {
        controller.abort();
        return clock.sleep(durationMs);
      },
    });

  expect(result).toEqual({ completed: false, completedPomodoros: 0 });
  expect(events).toEqual([]);
});

test('待機処理が中断で失敗した場合も中断として扱う', async () => {
  const controller = new AbortController(),
    result = await runPomodoroTimer({
      loopCount: 1,
      now: () => START_TIME,
      signal: controller.signal,
      sleep: () => {
        controller.abort();
        return Promise.reject(new Error('aborted'));
      },
    });

  expect(result).toEqual({ completed: false, completedPomodoros: 0 });
});

test('中断以外の待機処理の失敗は呼び出し元へ伝える', async () => {
  const failure = new Error('timer failed');

  await expect(
    runPomodoroTimer({
      loopCount: 1,
      now: () => START_TIME,
      sleep: () => Promise.reject(failure),
    }),
  ).rejects.toBe(failure);
});

/** 一時停止と再開を切り替える操作です。 */
const togglePauseAction = (controls: TimerControls): void => {
    controls.togglePause();
  },
  /** 現在のフェーズをskipする操作です。 */
  skipAction = (controls: TimerControls): void => {
    controls.skip();
  };

describe('実行中の操作', () => {
  /**
   * 指定した回の待機の直前に操作を行いながらタイマーを実行します。
   *
   * 作業2秒・休憩1秒を`loopCount`回繰り返し、フェーズの開始、完了、skipを
   * 経過時間付きで記録します。
   */
  const runWithActions = async (
    actions: ReadonlyMap<number, (controls: TimerControls) => void>,
    loopCount = 1,
  ): Promise<TimerRun & { readonly settled: boolean[] }> => {
    const clock = createFakeClock(),
      events: string[] = [],
      settled: boolean[] = [];
    let controls: TimerControls | undefined,
      sleepCount = 0;
    const result = await runPomodoroTimer({
      bindControls: (bound) => {
        controls = bound;
      },
      breakDurationMs: CUSTOM_BREAK_DURATION_MS,
      loopCount,
      now: clock.now,
      onPhaseCompleted: (phase, { final }) => {
        events.push(`completed:${phase}:${clock.elapsed()}${final ? ':final' : ''}`);
      },
      onPhaseSkipped: (phase) => {
        events.push(`skipped:${phase}:${clock.elapsed()}`);
      },
      onPhaseStarted: (phase, durationMs) => {
        events.push(`started:${phase}:${durationMs}:${clock.elapsed()}`);
      },
      sleep: (durationMs) => {
        const action = actions.get(sleepCount);

        sleepCount += 1;

        if (action !== undefined && controls !== undefined) {
          action(controls);
        }

        return clock.sleep(durationMs);
      },
      workDurationMs: CUSTOM_WORK_DURATION_MS,
    });

    if (controls !== undefined) {
      settled.push(controls.settle());
    }

    return { elapsedMs: clock.elapsed(), events, result, settled };
  };

  test('一時停止中は時間を経過させず、再開後に残り時間で完了する', async () => {
    const run = await runWithActions(
      new Map([
        [2, togglePauseAction],
        [12, togglePauseAction],
      ]),
    );

    expect(run.events).toEqual([
      'started:work:2000:0',
      'completed:work:4500',
      'started:break:1000:4500',
      'completed:break:5500:final',
    ]);
  });

  test('作業のskipでは完了数を増やさず、音の契機となる完了も通知しない', async () => {
    const run = await runWithActions(new Map([[2, skipAction]]));

    expect(run.events).toEqual([
      'started:work:2000:0',
      'skipped:work:500',
      'started:break:1000:500',
      'completed:break:1500:final',
    ]);
    expect(run.result).toEqual({ completed: true, completedPomodoros: 0 });
  });

  test('最後の休憩のskipでタイマーを完了し、以後の操作は何もしない', async () => {
    const run = await runWithActions(new Map([[9, skipAction]]));

    expect(run.events).toEqual([
      'started:work:2000:0',
      'completed:work:2000',
      'started:break:1000:2000',
      'skipped:break:2250',
    ]);
    expect(run.result).toEqual({ completed: true, completedPomodoros: 1 });
    expect(run.settled).toEqual([true]);
  });

  test('期限到達済みのフェーズは操作の前に自然終了として精算し、同じ操作を次のフェーズへ適用する', async () => {
    const clock = createFakeClock(),
      events: string[] = [];
    let controls: TimerControls | undefined;

    const timer = runPomodoroTimer({
      bindControls: (bound) => {
        controls = bound;
      },
      breakDurationMs: CUSTOM_BREAK_DURATION_MS,
      loopCount: 2,
      now: clock.now,
      onPhaseCompleted: (phase) => {
        events.push(`completed:${phase}`);
      },
      onPhaseSkipped: (phase) => {
        events.push(`skipped:${phase}`);
      },
      onPhaseStarted: (phase) => {
        events.push(`started:${phase}:${clock.elapsed()}`);
      },
      sleep: async (durationMs) => {
        if (clock.elapsed() === 0) {
          // 1回目の待機中に作業の期限を過ぎてからskipする
          await clock.sleep(CUSTOM_WORK_DURATION_MS);
          controls?.skip();
          return;
        }

        await clock.sleep(durationMs);
      },
      workDurationMs: CUSTOM_WORK_DURATION_MS,
    });

    await timer;

    expect(events.slice(0, 5)).toEqual([
      'started:work:0',
      'completed:work',
      'started:break:2000',
      'skipped:break',
      'started:work:2000',
    ]);
  });

  test('settleは期限到達済みのフェーズだけを精算し、タイマーが完了した場合だけtrueを返す', async () => {
    const clock = createFakeClock(),
      events: string[] = [],
      settled: boolean[] = [];

    const result = await runPomodoroTimer({
      bindControls: (controls) => {
        // 作業の期限を過ぎた時点では作業だけを精算し、休憩は期限前なのでfalse
        void clock.sleep(CUSTOM_WORK_DURATION_MS);
        settled.push(controls.settle());
        // 最後の休憩の期限を過ぎた時点ではタイマーが完了するのでtrue
        void clock.sleep(CUSTOM_BREAK_DURATION_MS);
        settled.push(controls.settle());
      },
      breakDurationMs: CUSTOM_BREAK_DURATION_MS,
      loopCount: 1,
      now: clock.now,
      onPhaseCompleted: (phase, { final }) => {
        events.push(`completed:${phase}${final ? ':final' : ''}`);
      },
      sleep: clock.sleep,
      workDurationMs: CUSTOM_WORK_DURATION_MS,
    });

    expect(settled).toEqual([false, true]);
    expect(events).toEqual(['completed:work', 'completed:break:final']);
    expect(result).toEqual({ completed: true, completedPomodoros: 1 });
  });

  test('中断後の操作は何もしない', async () => {
    const controller = new AbortController(),
      events: string[] = [];
    let controls: TimerControls | undefined;

    await runPomodoroTimer({
      bindControls: (bound) => {
        controls = bound;
      },
      loopCount: 1,
      now: () => START_TIME,
      onPhaseSkipped: (phase) => {
        events.push(`skipped:${phase}`);
      },
      signal: controller.signal,
      sleep: () => {
        controller.abort();
        return Promise.resolve();
      },
    });

    controls?.skip();
    controls?.togglePause();

    expect(controls?.settle()).toBe(false);
    expect(events).toEqual([]);
  });
});
