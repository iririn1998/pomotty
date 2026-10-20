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

describe('大きな数字', () => {
  const LONG_SETTINGS: TimerSettings = {
      breakDurationMs: 5 * MINUTE_MS,
      loopCount: 1,
      workDurationMs: 600 * MINUTE_MS,
    },
    bigRowsFor = (remainingSeconds: number): string[] =>
      frameFor({ remainingMs: remainingSeconds * 1000, settings: LONG_SETTINGS }).slice(2, 7);

  test('1時間以上の残り時間をH:MM:SSで描画し、1から5の字形を使う', () => {
    expect(bigRowsFor(1 * 3600 + 23 * 60 + 45)).toEqual([
      '  ████      ██████ ██████    ██  ██ ██████',
      '    ██   ██     ██     ██ ██ ██  ██ ██',
      '    ██      ██████ ██████    ██████ ██████',
      '    ██   ██ ██         ██ ██     ██     ██',
      '  ██████    ██████ ██████        ██ ██████',
    ]);
  });

  test('6、7、8、0の字形を使う', () => {
    expect(bigRowsFor(6 * 3600 + 7 * 60 + 8)).toEqual([
      '  ██████    ██████ ██████    ██████ ██████',
      '  ██     ██ ██  ██     ██ ██ ██  ██ ██  ██',
      '  ██████    ██  ██     ██    ██  ██ ██████',
      '  ██  ██ ██ ██  ██     ██ ██ ██  ██ ██  ██',
      '  ██████    ██████     ██    ██████ ██████',
    ]);
  });

  test('9の字形を使う', () => {
    expect(bigRowsFor(9 * 3600 + 59 * 60 + 9)).toEqual([
      '  ██████    ██████ ██████    ██████ ██████',
      '  ██  ██ ██ ██     ██  ██ ██ ██  ██ ██  ██',
      '  ██████    ██████ ██████    ██  ██ ██████',
      '      ██ ██     ██     ██ ██ ██  ██     ██',
      '  ██████    ██████ ██████    ██████ ██████',
    ]);
  });

  test('バーより幅の広い残り時間は中央寄せせず、インデントの位置から描画する', () => {
    const frame = frameFor({
      remainingMs: 50 * 60 * MINUTE_MS,
      settings: { breakDurationMs: MINUTE_MS, loopCount: 1, workDurationMs: 100 * 60 * MINUTE_MS },
    });

    expect(frame[2]).toBe('  ██████ ██████    ██████ ██████    ██████ ██████');
  });

  test('残り0秒は0:00と表示する', () => {
    expect(frameFor({ remainingMs: 0 }).slice(2, 7)).toEqual([
      '          ██████    ██████ ██████',
      '          ██  ██ ██ ██  ██ ██  ██',
      '          ██  ██    ██  ██ ██  ██',
      '          ██  ██ ██ ██  ██ ██  ██',
      '          ██████    ██████ ██████',
    ]);
  });
});

describe('経過時間の行', () => {
  test('経過時間、経過率、長さが収まらない場合は最低限の間隔で並べる', () => {
    const frame = frameFor({
      remainingMs: 50 * 60 * MINUTE_MS,
      settings: { breakDurationMs: MINUTE_MS, loopCount: 1, workDurationMs: 200 * 60 * MINUTE_MS },
    });

    expect(frame[9]).toBe('  150:00:00 elapsed  75%  200:00:00 total');
  });

  test('経過率0%と100%の経過バーを表示する', () => {
    expect(frameFor({ remainingMs: 15 * MINUTE_MS }).slice(8, 10)).toEqual([
      '  ────────────────────────────────────────',
      '  0:00 elapsed       0%        15:00 total',
    ]);
    expect(frameFor({ remainingMs: 0 }).slice(8, 10)).toEqual([
      '  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
      '  15:00 elapsed     100%       15:00 total',
    ]);
  });
});

describe('色の指定', () => {
  test('フェーズ名、大きな数字、経過バーの充填部分にフェーズの色を指定する', () => {
    const frame = createTimerFrame({
      columns: 80,
      now: NOW,
      settings: DEFAULT_SETTINGS,
      state: {
        completedPomodoros: 0,
        cycle: 1,
        endsAt: NOW + 5 * MINUTE_MS,
        paused: false,
        phase: 'work',
        remainingMs: 0,
      },
    });

    expect(frame.slice(0, 9)).toEqual([
      [
        { text: '  ' },
        { text: '🍅 WORK', tone: 'work' },
        { text: '                      Cycle 1 / 3' },
      ],
      [],
      [{ text: '          ' }, { text: '██████    ██████ ██████', tone: 'work' }],
      [{ text: '          ' }, { text: '██     ██ ██  ██ ██  ██', tone: 'work' }],
      [{ text: '          ' }, { text: '██████    ██  ██ ██  ██', tone: 'work' }],
      [{ text: '          ' }, { text: '    ██ ██ ██  ██ ██  ██', tone: 'work' }],
      [{ text: '          ' }, { text: '██████    ██████ ██████', tone: 'work' }],
      [],
      [
        { text: '  ' },
        { text: '━━━━━━━━━━━━━━━━━━━━━━━━━━', tone: 'work' },
        { text: '──────────────' },
      ],
    ]);
  });

  test('休憩中はフェーズの色を休憩にする', () => {
    const [header] = createTimerFrame({
      columns: 80,
      now: NOW,
      settings: DEFAULT_SETTINGS,
      state: {
        completedPomodoros: 0,
        cycle: 1,
        endsAt: NOW,
        paused: true,
        phase: 'break',
        remainingMs: MINUTE_MS,
      },
    });

    expect(header?.[1]).toEqual({ text: '☕ BREAK PAUSED', tone: 'break' });
  });
});

describe('画面の切り替え', () => {
  test('標準の画面がちょうど収まる43列では標準の画面を表示する', () => {
    expect(frameFor({ columns: 43, remainingMs: 5 * MINUTE_MS })).toHaveLength(17);
  });

  test('42列では標準の画面が収まらないためコンパクト表示にする', () => {
    expect(frameFor({ columns: 42, remainingMs: 5 * MINUTE_MS })).toEqual([
      '🍅 WORK  1/3',
      '5:00 left · 66%',
      '━━━━━━━━━━━━━━━━━━━━━━━━━━──────────────',
      '[sp]pause [s]skip [q]quit',
    ]);
  });

  test('コンパクト表示では経過バーを端末幅へ縮め、収まらない行を省略する', () => {
    expect(frameFor({ columns: 21, phase: 'break', remainingMs: 5 * MINUTE_MS })).toEqual([
      '☕ BREAK  1/3',
      '5:00 left · 0%',
      '────────────────────',
      '[sp]pause [s]skip […',
    ]);
  });

  test('20列では1行表示にする', () => {
    expect(frameFor({ columns: 20, phase: 'break', remainingMs: 5 * MINUTE_MS })).toEqual([
      'BREAK 5:00 1/3',
    ]);
  });

  test('1列では省略記号だけを表示する', () => {
    expect(frameFor({ columns: 1, remainingMs: 5 * MINUTE_MS })).toEqual(['…']);
  });

  test('列数が未定義の場合は80列として扱う', () => {
    const frame = createTimerFrame({
      now: NOW,
      settings: DEFAULT_SETTINGS,
      state: {
        completedPomodoros: 0,
        cycle: 1,
        endsAt: NOW + 5 * MINUTE_MS,
        paused: false,
        phase: 'work',
        remainingMs: 0,
      },
    });

    expect(frame).toHaveLength(17);
  });

  test('どの列数でも各行を端末幅より1セル狭く収める', () => {
    for (let columns = 2; columns <= 100; columns += 1) {
      for (const paused of [false, true]) {
        for (const line of frameFor({ columns, cycle: 2, paused, remainingMs: 8 * MINUTE_MS })) {
          expect(cellWidth(line)).toBeLessThanOrEqual(columns - 1);
        }
      }
    }
  });
});
