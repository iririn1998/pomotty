import { remainingMsAt, togglePause, transitionFromSkip } from './state.ts';
import type { TimerState } from './state.ts';
import { expect, test } from 'vitest';

const NOW = 1_700_000_000_000,
  SETTINGS = { breakDurationMs: 1000, loopCount: 2, workDurationMs: 2000 },
  running = (overrides: Partial<TimerState> = {}): TimerState => ({
    completedPomodoros: 0,
    cycle: 1,
    endsAt: NOW + 500,
    paused: false,
    phase: 'work',
    remainingMs: 0,
    ...overrides,
  });

test('作業のskipでは完了数を増やさず、同じサイクルの休憩を全量で開始する', () => {
  expect(transitionFromSkip(running(), NOW, SETTINGS)).toEqual({
    final: false,
    skippedPhase: 'work',
    state: running({ endsAt: NOW + 1000, phase: 'break' }),
  });
});

test('休憩のskipでは次のサイクルの作業を開始し、最後の休憩なら完了とする', () => {
  expect(transitionFromSkip(running({ phase: 'break' }), NOW, SETTINGS)).toEqual({
    final: false,
    skippedPhase: 'break',
    state: running({ cycle: 2, endsAt: NOW + 2000 }),
  });
  expect(transitionFromSkip(running({ cycle: 2, phase: 'break' }), NOW, SETTINGS)).toMatchObject({
    final: true,
    skippedPhase: 'break',
  });
});

test('一時停止中のskipでは次のフェーズを一時停止せずに開始する', () => {
  const paused = running({ paused: true, remainingMs: 300 });

  expect(transitionFromSkip(paused, NOW, SETTINGS).state).toEqual(
    running({ endsAt: NOW + 1000, phase: 'break' }),
  );
});

test('一時停止で残り時間を保存し、再開で現在時刻から終了予定時刻を復元する', () => {
  const paused = togglePause(running(), NOW + 200);

  expect(paused).toMatchObject({ paused: true, remainingMs: 300 });
  expect(remainingMsAt(paused, NOW + 10_000)).toBe(300);
  expect(togglePause(paused, NOW + 10_000)).toEqual(running({ endsAt: NOW + 10_300 }));
});

test('実行中の残り時間は0未満にしない', () => {
  expect(remainingMsAt(running(), NOW + 100)).toBe(400);
  expect(remainingMsAt(running(), NOW + 900)).toBe(0);
});
