import { DEFAULT_BREAK_DURATION_MS, DEFAULT_WORK_DURATION_MS, runPomodoroCycle } from './timer.ts';
import { expect, test } from 'vitest';
import type { TimerPhase } from './timer.ts';

const CUSTOM_BREAK_DURATION_MS = 20,
  CUSTOM_WORK_DURATION_MS = 10;

test('作業と休憩を既定時間で1回ずつ順番に実行する', async () => {
  const events: string[] = [];

  await runPomodoroCycle({
    onPhaseCompleted: (phase) => {
      events.push(`completed:${phase}`);
    },
    onPhaseStarted: (phase, durationMs) => {
      events.push(`started:${phase}:${durationMs}`);
    },
    wait: (durationMs) => {
      events.push(`wait:${durationMs}`);
      return Promise.resolve();
    },
  });

  expect(events).toEqual([
    `started:work:${DEFAULT_WORK_DURATION_MS}`,
    `wait:${DEFAULT_WORK_DURATION_MS}`,
    'completed:work',
    `started:break:${DEFAULT_BREAK_DURATION_MS}`,
    `wait:${DEFAULT_BREAK_DURATION_MS}`,
    'completed:break',
  ]);
});

test('作業と休憩の時間を差し替えられる', async () => {
  const completedPhases: TimerPhase[] = [],
    durations: number[] = [];

  await runPomodoroCycle({
    breakDurationMs: CUSTOM_BREAK_DURATION_MS,
    onPhaseCompleted: (phase) => {
      completedPhases.push(phase);
    },
    wait: (durationMs) => {
      durations.push(durationMs);
      return Promise.resolve();
    },
    workDurationMs: CUSTOM_WORK_DURATION_MS,
  });

  expect(durations).toEqual([CUSTOM_WORK_DURATION_MS, CUSTOM_BREAK_DURATION_MS]);
  expect(completedPhases).toEqual(['work', 'break']);
});
