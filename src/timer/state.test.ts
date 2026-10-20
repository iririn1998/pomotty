import {
  createInitialState,
  durationFor,
  remainingMsAt,
  togglePause,
  transitionFromSkip,
  transitionFromTimeout,
} from './state.ts';
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

test('初期状態は1サイクル目の作業を開始時刻から所定の時間で実行する', () => {
  expect(createInitialState(SETTINGS, NOW)).toEqual(running({ endsAt: NOW + 2000 }));
});

test.each([
  { expected: 2000, phase: 'work' },
  { expected: 1000, phase: 'break' },
] as const)('$phaseの長さは$expected msである', ({ expected, phase }) => {
  expect(durationFor(phase, SETTINGS)).toBe(expected);
});

test('作業の自然終了では完了数を1増やし、同じサイクルの休憩を現在時刻から開始する', () => {
  expect(transitionFromTimeout(running({ completedPomodoros: 3 }), NOW + 700, SETTINGS)).toEqual({
    completedPhase: 'work',
    final: false,
    state: running({ completedPomodoros: 4, endsAt: NOW + 1700, phase: 'break' }),
  });
});

test('休憩の自然終了では完了数を変えない', () => {
  expect(
    transitionFromTimeout(running({ completedPomodoros: 1, phase: 'break' }), NOW, SETTINGS).state,
  ).toEqual(running({ completedPomodoros: 1, cycle: 2, endsAt: NOW + 2000 }));
});

test('最後の休憩の自然終了では状態を変えずに最終フェーズとして返す', () => {
  const finalBreak = running({ completedPomodoros: 2, cycle: 2, phase: 'break' });

  expect(transitionFromTimeout(finalBreak, NOW, SETTINGS)).toEqual({
    completedPhase: 'break',
    final: true,
    state: finalBreak,
  });
});

test('最後の休憩のskipでは状態を変えずに最終フェーズとして返す', () => {
  const finalBreak = running({ cycle: 2, phase: 'break' });

  expect(transitionFromSkip(finalBreak, NOW, SETTINGS)).toEqual({
    final: true,
    skippedPhase: 'break',
    state: finalBreak,
  });
});

test('skipでは完了数を引き継ぐ', () => {
  expect(
    transitionFromSkip(running({ completedPomodoros: 1, phase: 'break' }), NOW, SETTINGS).state,
  ).toMatchObject({ completedPomodoros: 1, cycle: 2, phase: 'work' });
});

test('loopCount = 1では最初の休憩が最後の休憩である', () => {
  expect(
    transitionFromTimeout(running({ phase: 'break' }), NOW, { ...SETTINGS, loopCount: 1 }),
  ).toMatchObject({ final: true });
});

test('期限を過ぎてから一時停止すると残り時間0で停止する', () => {
  expect(togglePause(running(), NOW + 900)).toEqual(running({ paused: true, remainingMs: 0 }));
});

test('一時停止と再開ではフェーズ、サイクル、完了数を変えない', () => {
  const state = running({ completedPomodoros: 1, cycle: 2, phase: 'break' }),
    paused = togglePause(state, NOW + 100);

  expect(paused).toEqual({ ...state, paused: true, remainingMs: 400 });
  expect(togglePause(paused, NOW + 1000)).toEqual({ ...state, endsAt: NOW + 1400 });
});

test('実行中の残り時間は終了予定時刻ちょうどで0になる', () => {
  expect(remainingMsAt(running(), NOW + 500)).toBe(0);
});
