import { formatClock, progressFor } from './clock.ts';
import type { TimerSettings } from '#src/timer/state.ts';
import { describe, expect, test } from 'vitest';

const MINUTE_MS = 60_000,
  NOW = 1_700_000_000_000,
  DEFAULT_SETTINGS: TimerSettings = {
    breakDurationMs: 5 * MINUTE_MS,
    loopCount: 3,
    workDurationMs: 15 * MINUTE_MS,
  };

describe('時間の書式', () => {
  test.each([
    { expected: '0:00', seconds: 0 },
    { expected: '0:07', seconds: 7 },
    { expected: '5:00', seconds: 300 },
    { expected: '59:59', seconds: 3599 },
    { expected: '1:00:00', seconds: 3600 },
    { expected: '24:00:00', seconds: 86_400 },
  ])('$seconds秒を$expectedと表示する', ({ expected, seconds }) => {
    expect(formatClock(seconds)).toBe(expected);
  });

  test('残り時間は秒を切り上げ、残り1msでも0:01と表示する', () => {
    const state = {
      completedPomodoros: 0,
      cycle: 1,
      endsAt: NOW + 1,
      paused: false,
      phase: 'work' as const,
      remainingMs: 0,
    };

    expect(progressFor(state, NOW, DEFAULT_SETTINGS)).toMatchObject({
      elapsedSeconds: 899,
      percent: 99,
      remainingSeconds: 1,
      totalSeconds: 900,
    });
  });

  test('残り3599.5秒は59:59ではなく1:00:00として扱う', () => {
    const settings = { ...DEFAULT_SETTINGS, workDurationMs: 90 * MINUTE_MS },
      state = {
        completedPomodoros: 0,
        cycle: 1,
        endsAt: NOW + 3_599_500,
        paused: false,
        phase: 'work' as const,
        remainingMs: 0,
      };

    expect(formatClock(progressFor(state, NOW, settings).remainingSeconds)).toBe('1:00:00');
  });

  test('時計が戻って残り時間が長さを超えても経過率は0%に留める', () => {
    const state = {
      completedPomodoros: 0,
      cycle: 1,
      endsAt: NOW + 20 * MINUTE_MS,
      paused: false,
      phase: 'work' as const,
      remainingMs: 0,
    };

    expect(progressFor(state, NOW, DEFAULT_SETTINGS)).toMatchObject({
      elapsedSeconds: 0,
      percent: 0,
      ratio: 0,
    });
  });
});
