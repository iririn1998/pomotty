import type { TimerPhase, TimerSettings, TimerState } from '#src/timer/state.ts';
import { describe, expect, test } from 'vitest';
import { createTimeline } from './timeline.ts';
import { stringifyFrameLine } from './frame-line.ts';

const MINUTE_MS = 60_000,
  DEFAULT_SETTINGS: TimerSettings = {
    breakDurationMs: 5 * MINUTE_MS,
    loopCount: 3,
    workDurationMs: 15 * MINUTE_MS,
  },
  EVEN_SETTINGS: TimerSettings = {
    breakDurationMs: 10 * MINUTE_MS,
    loopCount: 1,
    workDurationMs: 10 * MINUTE_MS,
  },
  stateFor = (cycle: number, phase: TimerPhase = 'work'): TimerState => ({
    completedPomodoros: 0,
    cycle,
    endsAt: 0,
    paused: false,
    phase,
    remainingMs: 0,
  }),
  /** タイムラインを色なしの文字列の配列として返します。 */
  timelineFor = (
    state: TimerState,
    settings: TimerSettings = DEFAULT_SETTINGS,
    ratio = 0,
  ): string[] =>
    createTimeline(state, settings, ratio).map((line) => stringifyFrameLine(line, false));

describe('サイクルの状態', () => {
  test('完了したサイクルに✓、現在のサイクルに◀ nowを付け、以降のサイクルは空にする', () => {
    expect(timelineFor(stateFor(2))).toEqual([
      '  #1  ███████████████ █████  ✓',
      '  #2  ··············· ·····  ◀ now',
      '  #3  ··············· ·····',
      '      work 15:00      break 5:00',
    ]);
  });

  test('作業中は現在のサイクルの作業を経過率で伸ばし、休憩は空にする', () => {
    expect(timelineFor(stateFor(1), EVEN_SETTINGS, 0.5)).toEqual([
      '  #1  █████····· ··········  ◀ now',
      '      work 10:00 break 10:00',
    ]);
  });

  test('休憩中は現在のサイクルの作業を完了済みにし、休憩を経過率で伸ばす', () => {
    expect(timelineFor(stateFor(1, 'break'), EVEN_SETTINGS, 0.25)[0]).toBe(
      '  #1  ██████████ ██▌·······  ◀ now',
    );
  });

  test('経過率は1セルを8段階に分けて表示する', () => {
    const eighth = 1 / 80;

    expect(
      ['', '▏', '▎', '▍', '▌', '▋', '▊', '▉'].map(
        (_partial, index) => timelineFor(stateFor(1), EVEN_SETTINGS, 0.5 + index * eighth)[0],
      ),
    ).toEqual([
      '  #1  █████····· ··········  ◀ now',
      '  #1  █████▏···· ··········  ◀ now',
      '  #1  █████▎···· ··········  ◀ now',
      '  #1  █████▍···· ··········  ◀ now',
      '  #1  █████▌···· ··········  ◀ now',
      '  #1  █████▋···· ··········  ◀ now',
      '  #1  █████▊···· ··········  ◀ now',
      '  #1  █████▉···· ··········  ◀ now',
    ]);
  });

  test('経過率0と1ではバーを空と満杯にする', () => {
    expect(timelineFor(stateFor(1), EVEN_SETTINGS, 0)[0]).toBe(
      '  #1  ·········· ··········  ◀ now',
    );
    expect(timelineFor(stateFor(1, 'break'), EVEN_SETTINGS, 1)[0]).toBe(
      '  #1  ██████████ ██████████  ◀ now',
    );
  });

  test('充填部分だけに作業と休憩の色を付ける', () => {
    expect(createTimeline(stateFor(1, 'break'), EVEN_SETTINGS, 0.25)[0]).toEqual([
      { text: '  #1  ' },
      { text: '██████████', tone: 'work' },
      { text: '' },
      { text: ' ' },
      { text: '██▌', tone: 'break' },
      { text: '·······' },
      { text: '  ◀ now' },
    ]);
  });
});

describe('バーのセル数', () => {
  test('作業と休憩の合計20セルを時間の比率で分ける', () => {
    expect(timelineFor(stateFor(1), DEFAULT_SETTINGS)[0]).toBe(
      '  #1  ··············· ·····  ◀ now',
    );
  });

  test('作業が極端に短くても作業へ2セルを割り当てる', () => {
    expect(
      timelineFor(
        stateFor(1),
        { breakDurationMs: 1440 * MINUTE_MS, loopCount: 1, workDurationMs: MINUTE_MS },
        1,
      )[0],
    ).toBe('  #1  ██ ··················  ◀ now');
  });

  test('休憩が極端に短くても休憩へ2セルを割り当てる', () => {
    expect(
      timelineFor(
        stateFor(1, 'break'),
        { breakDurationMs: MINUTE_MS, loopCount: 1, workDurationMs: 1440 * MINUTE_MS },
        0.5,
      )[0],
    ).toBe('  #1  ██████████████████ █·  ◀ now');
  });
});

describe('表示するサイクルの範囲', () => {
  test('5サイクル以下ではすべてのサイクルを表示し、省略行を出さない', () => {
    expect(timelineFor(stateFor(3), { ...DEFAULT_SETTINGS, loopCount: 5 })).toEqual([
      '  #1  ███████████████ █████  ✓',
      '  #2  ███████████████ █████  ✓',
      '  #3  ··············· ·····  ◀ now',
      '  #4  ··············· ·····',
      '  #5  ··············· ·····',
      '      work 15:00      break 5:00',
    ]);
  });

  test('1サイクルだけなら1行と凡例を表示する', () => {
    expect(timelineFor(stateFor(1), { ...DEFAULT_SETTINGS, loopCount: 1 })).toEqual([
      '  #1  ··············· ·····  ◀ now',
      '      work 15:00      break 5:00',
    ]);
  });

  test('最初のサイクル付近では先頭から5サイクルを表示し、残りの数を下に示す', () => {
    expect(timelineFor(stateFor(1), { ...DEFAULT_SETTINGS, loopCount: 6 })).toEqual([
      '  #1  ··············· ·····  ◀ now',
      '  #2  ··············· ·····',
      '  #3  ··············· ·····',
      '  #4  ··············· ·····',
      '  #5  ··············· ·····',
      '      ⋮ 1 more',
      '      work 15:00      break 5:00',
    ]);
  });

  test('サイクル番号の桁数に合わせて番号とバーの位置を揃える', () => {
    expect(timelineFor(stateFor(10), { ...DEFAULT_SETTINGS, loopCount: 12 })).toEqual([
      '       ⋮ 7 done',
      '  #8   ███████████████ █████  ✓',
      '  #9   ███████████████ █████  ✓',
      '  #10  ··············· ·····  ◀ now',
      '  #11  ··············· ·····',
      '  #12  ··············· ·····',
      '       work 15:00      break 5:00',
    ]);
  });

  test('非常に多いサイクルでも現在の前後だけを表示する', () => {
    expect(
      timelineFor(stateFor(1_000_000), { ...DEFAULT_SETTINGS, loopCount: Number.MAX_SAFE_INTEGER }),
    ).toEqual([
      '            ⋮ 999997 done',
      '  #999998   ███████████████ █████  ✓',
      '  #999999   ███████████████ █████  ✓',
      '  #1000000  ··············· ·····  ◀ now',
      '  #1000001  ··············· ·····',
      '  #1000002  ··············· ·····',
      `            ⋮ ${Number.MAX_SAFE_INTEGER - 1_000_002} more`,
      '            work 15:00      break 5:00',
    ]);
  });
});

describe('凡例', () => {
  test('作業と休憩の長さを、それぞれのバーの開始位置へ揃える', () => {
    expect(timelineFor(stateFor(1)).at(-1)).toBe('      work 15:00      break 5:00');
  });

  test('作業の凡例が作業のバーに収まらない場合は区切り記号で1行に並べる', () => {
    expect(
      timelineFor(stateFor(1), {
        breakDurationMs: 1440 * MINUTE_MS,
        loopCount: 1,
        workDurationMs: MINUTE_MS,
      }).at(-1),
    ).toBe('      work 1:00 · break 24:00:00');
  });

  test('1時間以上の長さはH:MM:SSで表示する', () => {
    expect(
      timelineFor(stateFor(1), {
        breakDurationMs: MINUTE_MS,
        loopCount: 1,
        workDurationMs: 1440 * MINUTE_MS,
      }).at(-1),
    ).toBe('      work 24:00:00      break 1:00');
  });
});
