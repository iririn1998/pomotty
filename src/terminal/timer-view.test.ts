import { cellWidth, stringifyFrameLine } from './frame-line.ts';
import { createTimerFrame } from './timer-view.ts';
import type { TimerPhase, TimerSettings } from '#src/timer/state.ts';
import { describe, expect, test } from 'vitest';

const MINUTE_MS = 60_000,
  NOW = 1_700_000_000_000,
  DEFAULT_SETTINGS: TimerSettings = {
    breakDurationMs: 5 * MINUTE_MS,
    loopCount: 3,
    workDurationMs: 15 * MINUTE_MS,
  },
  /** 指定した状態の画面を、色なしの文字列の配列として返します。 */
  frameFor = ({
    columns = 80,
    cycle = 1,
    paused = false,
    phase = 'work',
    remainingMs,
    settings = DEFAULT_SETTINGS,
  }: {
    readonly columns?: number;
    readonly cycle?: number;
    readonly paused?: boolean;
    readonly phase?: TimerPhase;
    readonly remainingMs: number;
    readonly settings?: TimerSettings;
  }): string[] =>
    createTimerFrame({
      columns,
      now: NOW,
      settings,
      state: {
        completedPomodoros: 0,
        cycle,
        endsAt: NOW + remainingMs,
        paused,
        phase,
        remainingMs,
      },
    }).map((line) => stringifyFrameLine(line, false));

describe('標準の画面', () => {
  test('大きな残り時間、経過バー、サイクルのタイムラインを表示する', () => {
    expect(frameFor({ cycle: 2, remainingMs: 8 * MINUTE_MS + 42_000 })).toEqual([
      '  🍅 WORK                      Cycle 2 / 3',
      '',
      '          ██████    ██  ██ ██████',
      '          ██  ██ ██ ██  ██     ██',
      '          ██████    ██████ ██████',
      '          ██  ██ ██     ██ ██',
      '          ██████        ██ ██████',
      '',
      '  ━━━━━━━━━━━━━━━━────────────────────────',
      '  6:18 elapsed      42%        15:00 total',
      '',
      '  #1  ███████████████ █████  ✓',
      '  #2  ██████▎········ ·····  ◀ now',
      '  #3  ··············· ·····',
      '      work 15:00      break 5:00',
      '',
      '  [space] pause   [s] skip   [q] quit',
    ]);
  });

  test('休憩中は現在のサイクルの作業を完了済み、休憩を経過率で表示する', () => {
    const frame = frameFor({ cycle: 2, phase: 'break', remainingMs: 2.5 * MINUTE_MS });

    expect(frame[0]).toBe('  ☕ BREAK                     Cycle 2 / 3');
    expect(frame.slice(11, 14)).toEqual([
      '  #1  ███████████████ █████  ✓',
      '  #2  ███████████████ ██▌··  ◀ now',
      '  #3  ··············· ·····',
    ]);
  });

  test('サイクルが多い場合は現在の前後だけを表示し、省略した数を示す', () => {
    const frame = frameFor({
      cycle: 7,
      remainingMs: 90 * MINUTE_MS,
      settings: { breakDurationMs: 10 * MINUTE_MS, loopCount: 20, workDurationMs: 120 * MINUTE_MS },
    });

    expect(frame.slice(2, 3)).toEqual(['  ████      ██████ ██████    ██████ ██████']);
    expect(frame.slice(9)).toEqual([
      '  30:00 elapsed     25%      2:00:00 total',
      '',
      '      ⋮ 4 done',
      '  #5  ██████████████████ ██  ✓',
      '  #6  ██████████████████ ██  ✓',
      '  #7  ████▌············· ··  ◀ now',
      '  #8  ·················· ··',
      '  #9  ·················· ··',
      '      ⋮ 11 more',
      '      work 2:00:00       break 10:00',
      '',
      '  [space] pause   [s] skip   [q] quit',
    ]);
  });

  test('作業の凡例がバーより長い場合は凡例を1行に並べる', () => {
    const frame = frameFor({
      remainingMs: MINUTE_MS,
      settings: { breakDurationMs: 60 * MINUTE_MS, loopCount: 1, workDurationMs: MINUTE_MS },
    });

    expect(frame.at(-3)).toBe('      work 1:00 · break 1:00:00');
  });

  test('最後のサイクル付近では表示範囲を末尾へ寄せる', () => {
    const frame = frameFor({
      cycle: 10,
      remainingMs: 15 * MINUTE_MS,
      settings: { ...DEFAULT_SETTINGS, loopCount: 10 },
    });

    expect(frame.filter((line) => line.startsWith('  #')).map((line) => line.slice(0, 5))).toEqual([
      '  #6 ',
      '  #7 ',
      '  #8 ',
      '  #9 ',
      '  #10',
    ]);
    expect(frame).toContain('       ⋮ 5 done');
    expect(frame.some((line) => line.includes('more'))).toBe(false);
  });

  test('すべての行を端末幅より1セル狭く収める', () => {
    for (const columns of [44, 50, 80]) {
      for (const line of frameFor({ columns, cycle: 2, remainingMs: 8 * MINUTE_MS })) {
        expect(cellWidth(line)).toBeLessThanOrEqual(columns - 1);
      }
    }
  });
});

describe('一時停止中の画面', () => {
  test('一時停止した時点の残り時間を表示し、見出しとキー操作の案内を切り替える', () => {
    const frame = frameFor({ cycle: 2, paused: true, remainingMs: 8 * MINUTE_MS + 42_000 });

    expect(frame[0]).toBe('  🍅 WORK PAUSED               Cycle 2 / 3');
    expect(frame[2]).toBe('          ██████    ██  ██ ██████');
    expect(frame.at(-1)).toBe('  [space] resume   [s] skip   [q] quit');
  });

  test('コンパクト表示と1行表示でも一時停止を示す', () => {
    expect(frameFor({ columns: 40, paused: true, remainingMs: MINUTE_MS })).toEqual([
      '🍅 WORK PAUSED  1/3',
      '1:00 left · 93%',
      '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━───',
      '[sp]resume [s]skip [q]quit',
    ]);
    expect(frameFor({ columns: 18, paused: true, remainingMs: MINUTE_MS })).toEqual([
      'PAUSED 1:00 1/3',
    ]);
  });
});

describe('狭い端末の画面', () => {
  test('標準の画面が収まらない場合はコンパクト表示にする', () => {
    expect(frameFor({ columns: 40, cycle: 2, remainingMs: 8 * MINUTE_MS + 42_000 })).toEqual([
      '🍅 WORK  2/3',
      '8:42 left · 42%',
      '━━━━━━━━━━━━━━━━───────────────────────',
      '[sp]pause [s]skip [q]quit',
    ]);
  });

  test('20セル未満では1行で表示し、収まらない部分を省略する', () => {
    expect(frameFor({ columns: 15, cycle: 2, remainingMs: 8 * MINUTE_MS + 42_000 })).toEqual([
      'WORK 8:42 2/3',
    ]);
    expect(frameFor({ columns: 10, cycle: 2, remainingMs: 8 * MINUTE_MS + 42_000 })).toEqual([
      'WORK 8:4…',
    ]);
  });

  test('列数を取得できない場合は80列として扱う', () => {
    expect(frameFor({ columns: 0, remainingMs: MINUTE_MS })).toHaveLength(17);
  });
});
