import { formatClock, formatDuration, progressFor } from './clock.ts';
import type { TimerSettings, TimerState } from '#src/timer/state.ts';
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

describe('長さの書式', () => {
  test.each([
    { expected: '0:00', milliseconds: 0 },
    { expected: '0:01', milliseconds: 1 },
    { expected: '0:01', milliseconds: 1000 },
    { expected: '0:02', milliseconds: 1001 },
    { expected: '15:00', milliseconds: 15 * MINUTE_MS },
    { expected: '1:00:00', milliseconds: 60 * MINUTE_MS },
    { expected: '24:00:00', milliseconds: 1440 * MINUTE_MS },
  ])('$milliseconds msを秒へ切り上げて$expectedと表示する', ({ expected, milliseconds }) => {
    expect(formatDuration(milliseconds)).toBe(expected);
  });

  test.each([
    { expected: '1:01:01', seconds: 3661 },
    { expected: '10:00', seconds: 600 },
  ])('$seconds秒の分と秒を2桁へ0埋めする', ({ expected, seconds }) => {
    expect(formatClock(seconds)).toBe(expected);
  });
});

describe('フェーズの進み具合', () => {
  const stateFor = (overrides: Partial<TimerState>): TimerState => ({
    completedPomodoros: 0,
    cycle: 1,
    endsAt: NOW,
    paused: false,
    phase: 'work',
    remainingMs: 0,
    ...overrides,
  });

  test('開始直後は経過0、残りは長さ全体である', () => {
    expect(progressFor(stateFor({ endsAt: NOW + 15 * MINUTE_MS }), NOW, DEFAULT_SETTINGS)).toEqual({
      elapsedSeconds: 0,
      percent: 0,
      ratio: 0,
      remainingSeconds: 900,
      totalSeconds: 900,
    });
  });

  test('期限を過ぎた場合は経過率を100%に留め、残りを0にする', () => {
    expect(progressFor(stateFor({ endsAt: NOW - MINUTE_MS }), NOW, DEFAULT_SETTINGS)).toEqual({
      elapsedSeconds: 900,
      percent: 100,
      ratio: 1,
      remainingSeconds: 0,
      totalSeconds: 900,
    });
  });

  test('休憩中は休憩の長さを基準にする', () => {
    expect(
      progressFor(
        stateFor({ endsAt: NOW + 2.5 * MINUTE_MS, phase: 'break' }),
        NOW,
        DEFAULT_SETTINGS,
      ),
    ).toEqual({
      elapsedSeconds: 150,
      percent: 50,
      ratio: 0.5,
      remainingSeconds: 150,
      totalSeconds: 300,
    });
  });

  test('一時停止中は現在時刻にかかわらず、一時停止した時点の残り時間を使う', () => {
    const state = stateFor({ endsAt: NOW, paused: true, remainingMs: 3 * MINUTE_MS });

    expect(progressFor(state, NOW + 60 * MINUTE_MS, DEFAULT_SETTINGS)).toEqual({
      elapsedSeconds: 720,
      percent: 80,
      ratio: 0.8,
      remainingSeconds: 180,
      totalSeconds: 900,
    });
  });

  test('経過率の百分率は切り捨てる', () => {
    // 経過899.999秒は99.99…%だが100%とは表示しない
    expect(progressFor(stateFor({ endsAt: NOW + 1 }), NOW, DEFAULT_SETTINGS).percent).toBe(99);
    // 経過9秒（1%）に1ms満たない場合は0%
    expect(progressFor(stateFor({ endsAt: NOW + 891_001 }), NOW, DEFAULT_SETTINGS).percent).toBe(0);
  });
});
