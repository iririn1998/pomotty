import { describe, expect, test } from 'vitest';
import type { FrameLine } from './frame-line.ts';
import type { TimerSettings, TimerState } from '#src/timer/state.ts';
import { createTimeline } from './timeline.ts';

const MINUTE_MS = 60_000,
  /** 指定したサイクルとフェーズの状態を作成します。 */
  stateAt = (cycle: number, phase: TimerState['phase'] = 'work'): TimerState => ({
    completedPomodoros: cycle - 1,
    cycle,
    endsAt: 0,
    paused: false,
    phase,
    remainingMs: 0,
  }),
  /** 作業と休憩の分数、繰り返し回数から実行条件を作成します。 */
  settingsOf = (workMinutes: number, breakMinutes: number, loopCount = 1): TimerSettings => ({
    breakDurationMs: breakMinutes * MINUTE_MS,
    loopCount,
    workDurationMs: workMinutes * MINUTE_MS,
  }),
  /** 表示行を文字列へ変換します。 */
  plain = (line: FrameLine | undefined): string =>
    (line ?? []).map((segment) => segment.text).join(''),
  /** 表示行のうち、色を付ける部分の文字列とフェーズを返します。 */
  toned = (line: FrameLine | undefined): readonly string[] =>
    (line ?? [])
      .filter((segment) => segment.tone !== undefined && segment.text !== '')
      .map((segment) => `${segment.tone}:${segment.text}`);

describe('バーのセル数', () => {
  // 作業のバーを満たし、休憩のバーを空にして、それぞれのセル数を確かめる
  test.each([
    { breakMinutes: 5, expected: '  #1  ███████████████ ·····  ◀ now', workMinutes: 15 },
    { breakMinutes: 5, expected: '  #1  █████████████████ ···  ◀ now', workMinutes: 25 },
    { breakMinutes: 1, expected: '  #1  ██████████ ··········  ◀ now', workMinutes: 1 },
    { breakMinutes: 1440, expected: '  #1  ██ ··················  ◀ now', workMinutes: 1 },
    { breakMinutes: 1, expected: '  #1  ██████████████████ ··  ◀ now', workMinutes: 1440 },
  ])(
    '作業$workMinutes分・休憩$breakMinutes分では時間の比率で20セルを分け、それぞれ2セル以上とする',
    ({ breakMinutes, expected, workMinutes }) => {
      const settings = settingsOf(workMinutes, breakMinutes),
        [row] = createTimeline(stateAt(1), settings, 1);

      expect(plain(row)).toBe(expected);
    },
  );
});

describe('経過率のなめらかな表示', () => {
  test.each([
    { expected: '··········', ratio: 0 },
    { expected: '▏·········', ratio: 0.0125 },
    { expected: '▍·········', ratio: 0.0375 },
    { expected: '▉·········', ratio: 0.0875 },
    { expected: '█·········', ratio: 0.1 },
    { expected: '█████▌····', ratio: 0.55 },
    { expected: '█████████▉', ratio: 0.999 },
    { expected: '██████████', ratio: 1 },
  ])('経過率$ratioでは1セルを8段階に分けて$expectedと表示する', ({ expected, ratio }) => {
    const [row] = createTimeline(stateAt(1), settingsOf(1, 1), ratio);

    expect(plain(row).slice(6, 16)).toBe(expected);
  });

  test('充填した部分だけに作業と休憩の色を付ける', () => {
    const [row] = createTimeline(stateAt(1, 'break'), settingsOf(1, 1), 0.5);

    expect(toned(row)).toEqual(['work:██████████', 'break:█████']);
  });
});

describe('サイクルの状態', () => {
  test('完了したサイクルに✓、現在のサイクルに◀ nowを付け、以降は空のバーにする', () => {
    const lines = createTimeline(stateAt(2, 'break'), settingsOf(1, 1, 3), 0.3);

    expect(lines.map((line) => plain(line))).toEqual([
      '  #1  ██████████ ██████████  ✓',
      '  #2  ██████████ ███·······  ◀ now',
      '  #3  ·········· ··········',
      '      work 1:00  break 1:00',
    ]);
  });

  test.each([
    { cycle: 1, first: '#1 ', hiddenAfter: '⋮ 5 more', hiddenBefore: undefined },
    { cycle: 3, first: '#1 ', hiddenAfter: '⋮ 5 more', hiddenBefore: undefined },
    { cycle: 4, first: '#2 ', hiddenAfter: '⋮ 4 more', hiddenBefore: '⋮ 1 done' },
    { cycle: 8, first: '#6 ', hiddenAfter: undefined, hiddenBefore: '⋮ 5 done' },
    { cycle: 10, first: '#6 ', hiddenAfter: undefined, hiddenBefore: '⋮ 5 done' },
  ])(
    '10サイクル中のサイクル$cycleでは$first から5サイクルを表示する',
    ({ cycle, first, hiddenAfter, hiddenBefore }) => {
      const lines = createTimeline(stateAt(cycle), settingsOf(1, 1, 10), 0).map((line) =>
          plain(line).trim(),
        ),
        rows = lines.filter((line) => line.startsWith('#'));

      expect(rows).toHaveLength(5);
      expect(rows[0]?.startsWith(first)).toBe(true);
      expect(rows.filter((row) => row.endsWith('◀ now'))).toEqual([
        expect.stringMatching(new RegExp(`^#${cycle} `, 'u')),
      ]);
      expect(lines.find((line) => line.endsWith('done'))).toBe(hiddenBefore);
      expect(lines.find((line) => line.endsWith('more'))).toBe(hiddenAfter);
    },
  );

  test('サイクル番号の桁数が増えても、バーの開始位置を揃える', () => {
    const lines = createTimeline(stateAt(9), settingsOf(1, 1, 10), 0).map((line) => plain(line));

    expect(lines.filter((line) => line.includes('#'))).toEqual([
      '  #6   ██████████ ██████████  ✓',
      '  #7   ██████████ ██████████  ✓',
      '  #8   ██████████ ██████████  ✓',
      '  #9   ·········· ··········  ◀ now',
      '  #10  ·········· ··········',
    ]);
    expect(lines.at(-1)).toBe('       work 1:00  break 1:00');
  });
});

describe('凡例', () => {
  test('作業の凡例が作業のバーに収まる場合は、休憩の凡例を休憩のバーの開始位置へ揃える', () => {
    const lines = createTimeline(stateAt(1), settingsOf(25, 5), 0);

    expect(plain(lines.at(-1))).toBe('      work 25:00        break 5:00');
  });

  test('作業の凡例が作業のバーより長い場合は、凡例を区切り文字で1行に並べる', () => {
    const lines = createTimeline(stateAt(1), settingsOf(1, 1440), 0);

    expect(plain(lines.at(-1))).toBe('      work 1:00 · break 24:00:00');
  });
});
