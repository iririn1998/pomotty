import {
  DEFAULT_BREAK_DURATION_MS,
  DEFAULT_WORK_DURATION_MS,
  MILLISECONDS_PER_MINUTE,
  TICK_INTERVAL_MS,
  runPomodoroTimer,
  transitionFromTimeout,
} from './timer.ts';
import type { RunPomodoroTimerParameters, Sleep, TimerResult } from './timer.ts';
import { expect, test } from 'vitest';

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
    state = { completedPomodoros: 0, cycle: 1, endsAt: START_TIME, phase: 'work' } as const;

  expect(transitionFromTimeout(state, START_TIME, settings)).toEqual({
    completedPhase: 'work',
    final: false,
    state: {
      completedPomodoros: 1,
      cycle: 1,
      endsAt: START_TIME + CUSTOM_BREAK_DURATION_MS,
      phase: 'break',
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
      { completedPomodoros: 1, cycle: 1, endsAt: START_TIME, phase: 'break' },
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
      phase: 'work',
    },
  });
  expect(
    transitionFromTimeout(
      { completedPomodoros: 2, cycle: 2, endsAt: START_TIME, phase: 'break' },
      START_TIME,
      settings,
    ),
  ).toMatchObject({ completedPhase: 'break', final: true });
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
