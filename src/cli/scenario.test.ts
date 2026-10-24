import { currentFrame, readBigClock, startScenario } from './scenario.test-helper.ts';
import type { Scenario, ScenarioOptions } from './scenario.test-helper.ts';
import { describe, expect, test } from 'vitest';

/**
 * 実際の利用者の操作を、仮想の時計・端末・キーボードで再現するシナリオテストです。
 *
 * 各テストは「起動 → 時間経過 → キー操作 → 画面と外部への作用の確認」を
 * 台本のように記述します。画面は書き込まれた制御列を解釈して再現したもので、
 * 利用者が端末で見る内容と同じです。
 */

/** 作業1分・休憩1分を2回繰り返す、短い設定です。 */
const SHORT = ['--work', '1', '--break', '1', '--loop', '2'],
  SHUTDOWN = '2000ms',
  COMPLETION_SHUTDOWN = '5000ms',
  /** 開始確認でOKを選び、タイマーを開始した状態のシナリオを返します。 */
  startTimer = async (options: ScenarioOptions = {}): Promise<Scenario> => {
    const app = await startScenario({ arguments_: SHORT, ...options });

    await app.press('enter');
    return app;
  },
  /** 現在のタイマー画面です。 */
  frameOf = (app: Scenario): readonly string[] => currentFrame(app.terminal.lines()),
  /** 大きな数字で表示されている残り時間です。 */
  clockOf = (app: Scenario): string => readBigClock(app.terminal.lines()),
  /** 経過時間・経過率・合計時間の行です。 */
  progressLineOf = (app: Scenario): string | undefined =>
    frameOf(app)
      .find((line) => line.includes('elapsed'))
      ?.trim(),
  /** 再生した完了音だけを返します。 */
  playsOf = (app: Scenario): readonly string[] =>
    app.log().filter((entry) => entry.includes(' play:'));

describe('開始確認', () => {
  test('起動直後はロゴとOKを選択した確認を表示し、時間が経ってもタイマーを開始しない', async () => {
    const app = await startScenario({ arguments_: SHORT });

    expect(app.terminal.lastLines(3)).toEqual([
      'Start working? (Use ↑/↓ to select, Enter to confirm)',
      '❯ OK',
      '  NG',
    ]);
    expect(app.terminal.lines()[1]).toContain('██████╗');

    await app.advance('10:00');

    expect(app.finished()).toBe(false);
    expect(app.log()).toEqual([]);
    expect(app.terminal.text()).not.toContain('WORK');
  });

  test('↓と↑で選択を切り替え、確認を同じ位置へ描き直す', async () => {
    const app = await startScenario({ arguments_: SHORT });

    await app.press('down');

    expect(app.terminal.lastLines(3)).toEqual([
      'Start working? (Use ↑/↓ to select, Enter to confirm)',
      '  OK',
      '❯ NG',
    ]);

    await app.press('up');

    expect(app.terminal.lastLines(2)).toEqual(['❯ OK', '  NG']);

    // 端では反対側へ移る
    await app.press('up');

    expect(app.terminal.lastLines(2)).toEqual(['  OK', '❯ NG']);
    expect(app.terminal.lines().filter((line) => line.startsWith('Start working?'))).toHaveLength(
      1,
    );
  });

  test('確認中のspace、s、qなどのキーは無視する', async () => {
    const app = await startScenario({ arguments_: SHORT });

    await app.press('space', 's', 'q', 'x');

    expect(app.finished()).toBe(false);
    expect(app.terminal.lastLines(2)).toEqual(['❯ OK', '  NG']);
  });

  test('OKで確定すると作業を開始し、raw modeを確認とタイマーで1回ずつ切り替える', async () => {
    const app = await startTimer();

    expect(frameOf(app)[0]).toBe('  🍅 WORK                      Cycle 1 / 2');
    expect(app.terminal.cursorVisible()).toBe(false);
    expect(app.rawModes()).toEqual([true, false, true]);
  });

  test('NGで確定するとタイマーを開始せず、終了コード0で終える', async () => {
    const app = await startScenario({ arguments_: SHORT });

    await app.press('down', 'enter');

    expect(app.exitCode()).toBe(0);
    expect(app.terminal.lastLines(3)).toEqual(['  OK', '❯ NG', '⏹️ Work was not started.']);
    expect(app.log()).toEqual([
      '0:00.000 exit-code:0',
      '0:00.000 shutdown:abort',
      `0:00.000 schedule-exit:0:${SHUTDOWN}`,
    ]);
    expect(app.rawModes()).toEqual([true, false]);
  });

  test('確認中のCtrl+Cではタイマーを開始せず、終了コード0で終える', async () => {
    const app = await startScenario({ arguments_: SHORT });

    await app.press('ctrl+c');

    expect(app.exitCode()).toBe(0);
    expect(app.terminal.lastLines(1)).toEqual(['⏹️ Work was not started.']);
  });

  test('確認中に標準入力が閉じるとタイマーを開始せず、終了コード0で終える', async () => {
    const app = await startScenario({ arguments_: SHORT });

    await app.closeInput();

    expect(app.exitCode()).toBe(0);
    expect(app.terminal.lastLines(1)).toEqual(['⏹️ Work was not started.']);
  });
});

describe('残り時間の画面', () => {
  test('既定の設定では15分の作業を3サイクルで表示する', async () => {
    const app = await startScenario();

    await app.press('enter');

    expect(frameOf(app)).toEqual([
      '  🍅 WORK                      Cycle 1 / 3',
      '',
      '       ████   ██████    ██████ ██████',
      '         ██   ██     ██ ██  ██ ██  ██',
      '         ██   ██████    ██  ██ ██  ██',
      '         ██       ██ ██ ██  ██ ██  ██',
      '       ██████ ██████    ██████ ██████',
      '',
      '  ────────────────────────────────────────',
      '  0:00 elapsed       0%        15:00 total',
      '',
      '  #1  ··············· ·····  ◀ now',
      '  #2  ··············· ·····',
      '  #3  ··············· ·····',
      '      work 15:00      break 5:00',
      '',
      '  [space] pause   [s] skip   [q] quit',
    ]);
    expect(clockOf(app)).toBe('15:00');
  });

  test('残り時間は秒の切り上げで表示し、tickごとに描き直す', async () => {
    const app = await startTimer();

    await app.advance('0:00.999');

    // 最後のtick（0.750秒）では残り59.25秒なので1:00と表示する
    expect(clockOf(app)).toBe('1:00');
    expect(progressLineOf(app)).toBe('0:00 elapsed       1%         1:00 total');

    await app.advance('0:00.001');

    expect(clockOf(app)).toBe('0:59');
    expect(progressLineOf(app)).toBe('0:01 elapsed       1%         1:00 total');

    await app.advance('0:58.750');

    expect(clockOf(app)).toBe('0:01');
    expect(progressLineOf(app)).toBe('0:59 elapsed      99%         1:00 total');
  });

  test('経過率に応じて進捗バーとタイムラインを伸ばす', async () => {
    const app = await startTimer();

    await app.advance('0:15');

    expect(frameOf(app).slice(8, 14)).toEqual([
      '  ━━━━━━━━━━──────────────────────────────',
      '  0:15 elapsed      25%         1:00 total',
      '',
      '  #1  ██▌······· ··········  ◀ now',
      '  #2  ·········· ··········',
      '      work 1:00  break 1:00',
    ]);
  });

  test('フェーズの完了を行として残し、その下に次のフェーズを描画する', async () => {
    const app = await startTimer();

    await app.advance('1:00');

    expect(app.terminal.lines().filter((line) => line.includes('Work complete.'))).toEqual([
      '✅ Work complete.',
    ]);
    expect(frameOf(app)[0]).toBe('  ☕ BREAK                     Cycle 1 / 2');
    expect(clockOf(app)).toBe('1:00');
    expect(frameOf(app).slice(11, 13)).toEqual([
      '  #1  ██████████ ··········  ◀ now',
      '  #2  ·········· ··········',
    ]);

    await app.advance('1:30');

    expect(frameOf(app)[0]).toBe('  🍅 WORK                      Cycle 2 / 2');
    expect(clockOf(app)).toBe('0:30');
    expect(frameOf(app).slice(11, 13)).toEqual([
      '  #1  ██████████ ██████████  ✓',
      '  #2  █████····· ··········  ◀ now',
    ]);
  });

  test('1時間以上の残り時間は時・分・秒で表示する', async () => {
    const app = await startScenario({ arguments_: ['--work', '90'] });

    await app.press('enter');
    await app.advance('0:01');

    expect(clockOf(app)).toBe('1:29:59');
    expect(progressLineOf(app)).toBe('0:01 elapsed       0%      1:30:00 total');
  });

  test('サイクルが多い場合は現在の前後だけを表示し、省略した数を示す', async () => {
    const app = await startScenario({
      arguments_: ['--work', '1', '--break', '1', '--loop', '10'],
    });

    await app.press('enter');
    await app.press(...Array.from({ length: 10 }, () => 's'));

    expect(frameOf(app).slice(11, 19)).toEqual([
      '      ⋮ 3 done',
      '  #4  ██████████ ██████████  ✓',
      '  #5  ██████████ ██████████  ✓',
      '  #6  ·········· ··········  ◀ now',
      '  #7  ·········· ··········',
      '  #8  ·········· ··········',
      '      ⋮ 2 more',
      '      work 1:00  break 1:00',
    ]);
  });

  test('画面の行数が減っても、描き直した後に古い行を残さない', async () => {
    const app = await startScenario({
      arguments_: ['--work', '1', '--break', '1', '--loop', '10'],
    });

    await app.press('enter');
    // サイクル7までは「⋮ more」の行があり、サイクル8で消えて画面が1行減る
    await app.press(...Array.from({ length: 12 }, () => 's'));

    const linesBefore = app.terminal.lines().length;

    await app.press('s', 's');

    expect(frameOf(app).at(-1)).toBe('  [space] pause   [s] skip   [q] quit');
    expect(frameOf(app).filter((line) => line.endsWith('more'))).toEqual([]);
    // 飛ばした2フェーズの行が増え、画面が1行減る
    expect(app.terminal.lines()).toHaveLength(linesBefore + 2 - 1);
  });

  test('色が有効な場合は作業を赤、休憩を緑で表示する', async () => {
    const app = await startTimer({ color: true });

    await app.advance('0:30');

    const colored = currentFrame(app.terminal.coloredLines());

    expect(colored[0]).toBe('  <red>🍅 WORK</red>                      Cycle 1 / 2');
    expect(colored[8]).toBe('  <red>━━━━━━━━━━━━━━━━━━━━</red>────────────────────');
    expect(colored[11]).toBe('  #1  <red>█████</red>····· ··········  ◀ now');

    await app.advance('1:00');

    const breakFrame = currentFrame(app.terminal.coloredLines());

    expect(breakFrame[0]).toBe('  <green>☕ BREAK</green>                     Cycle 1 / 2');
    expect(breakFrame[11]).toBe('  #1  <red>██████████</red> <green>█████</green>·····  ◀ now');
  });

  test('色が無効な場合は色の制御列を出力しない', async () => {
    const app = await startTimer({ color: false });

    await app.advance('1:30');

    expect(app.terminal.raw()).not.toContain('\u001B[31m');
    expect(app.terminal.raw()).not.toContain('\u001B[32m');
  });
});

describe('端末幅', () => {
  test.each([
    { columns: 80, firstLine: '  🍅 WORK                      Cycle 1 / 2' },
    { columns: 43, firstLine: '  🍅 WORK                      Cycle 1 / 2' },
    { columns: 42, firstLine: '🍅 WORK  1/2' },
    { columns: 21, firstLine: '🍅 WORK  1/2' },
    { columns: 20, firstLine: 'WORK 1:00 1/2' },
  ])('$columns列の端末では折り返さずに収まる画面を選ぶ', async ({ columns, firstLine }) => {
    const app = await startTimer({ columns }),
      wrapsAtStart = app.terminal.wraps();

    expect(frameOf(app)[0]).toBe(firstLine);

    // 一時停止・skip・フェーズ遷移を経ても、タイマー画面は一度も折り返さない
    await app.advance('0:30');
    await app.press('space');
    await app.advance('0:10');
    await app.press('space', 's');
    await app.advance('1:30');

    expect(app.terminal.wraps()).toBe(wrapsAtStart);
  });

  test('コンパクト表示では残り時間・経過率・バー・キーの案内を表示する', async () => {
    const app = await startTimer({ columns: 40 });

    await app.advance('0:15');

    expect(frameOf(app)).toEqual([
      '🍅 WORK  1/2',
      '0:45 left · 25%',
      '━━━━━━━━━──────────────────────────────',
      '[sp]pause [s]skip [q]quit',
    ]);

    await app.press('space');

    expect(frameOf(app)).toEqual([
      '🍅 WORK PAUSED  1/2',
      '0:45 left · 25%',
      '━━━━━━━━━──────────────────────────────',
      '[sp]resume [s]skip [q]quit',
    ]);
  });

  test('1行表示では一時停止中にPAUSEDとだけ表示する', async () => {
    const app = await startTimer({ columns: 16 });

    await app.advance('0:15');

    expect(app.terminal.lastLines(1)).toEqual(['WORK 0:45 1/2']);

    await app.press('space');

    expect(app.terminal.lastLines(1)).toEqual(['PAUSED 0:45 1/2']);
  });

  test('ロゴが収まらない端末では短い見出しを表示する', async () => {
    const app = await startScenario({ arguments_: SHORT, columns: 66 });

    expect(app.terminal.lines().slice(0, 2)).toEqual(['', '  🍅 pomotty']);
  });

  test('実行中に端末幅が狭くなると、旧画面を残したまま新しい幅の画面を下へ追記する', async () => {
    const app = await startTimer();

    await app.advance('0:15');
    await app.resize(30);

    expect(app.terminal.lastLines(5)).toEqual([
      '  [space] pause   [s] skip   [q] quit',
      '🍅 WORK  1/2',
      '0:45 left · 25%',
      '━━━━━━━──────────────────────',
      '[sp]pause [s]skip [q]quit',
    ]);

    // 追記した後は、新しい画面を同じ位置へ描き直す
    await app.advance('0:15');

    expect(app.terminal.lastLines(4)).toEqual([
      '🍅 WORK  1/2',
      '0:30 left · 50%',
      '━━━━━━━━━━━━━━───────────────',
      '[sp]pause [s]skip [q]quit',
    ]);
    expect(app.terminal.lines().filter((line) => line === '🍅 WORK  1/2')).toHaveLength(1);
  });
});

describe('一時停止', () => {
  test('一時停止中は残り時間が進まず、再開後は残りの時間で完了して音を鳴らす', async () => {
    const app = await startTimer();

    await app.advance('0:20');
    await app.press('space');

    expect(frameOf(app)[0]).toBe('  🍅 WORK PAUSED               Cycle 1 / 2');
    expect(frameOf(app).at(-1)).toBe('  [space] resume   [s] skip   [q] quit');

    await app.advance('30:00');

    expect(clockOf(app)).toBe('0:40');
    expect(playsOf(app)).toEqual([]);

    await app.press('space');

    expect(frameOf(app)[0]).toBe('  🍅 WORK                      Cycle 1 / 2');
    expect(frameOf(app).at(-1)).toBe('  [space] pause   [s] skip   [q] quit');

    await app.advance('0:39.750');

    expect(playsOf(app)).toEqual([]);

    await app.advance('0:00.250');

    expect(playsOf(app)).toEqual(['31:00.000 play:work']);
  });

  test('tickの途中で一時停止しても、再開後の期限はtick間隔以内に検知する', async () => {
    const app = await startTimer();

    await app.advance('0:30.100');
    await app.press('space');
    await app.advance('0:09.900');
    await app.press('space');
    await app.advance('2:00');

    // 期限は1:09.900、次のtickは1:10.000
    expect(playsOf(app)[0]).toBe('1:10.000 play:work');
  });

  test('spaceを素早く何度押しても、押した回数に応じて一時停止と再開を切り替える', async () => {
    const app = await startTimer();

    await app.advance('0:10');
    await app.press('space', 'space', 'space');

    expect(frameOf(app)[0]).toContain('PAUSED');

    await app.advance('1:00');
    await app.press('space', 'space');

    expect(frameOf(app)[0]).toContain('PAUSED');
    expect(clockOf(app)).toBe('0:50');
  });

  test('一時停止中にskipすると、次のフェーズは一時停止せずに全量で開始する', async () => {
    const app = await startTimer();

    await app.advance('0:10');
    await app.press('space', 's');

    expect(frameOf(app)[0]).toBe('  ☕ BREAK                     Cycle 1 / 2');
    expect(clockOf(app)).toBe('1:00');

    await app.advance('0:30');

    expect(clockOf(app)).toBe('0:30');
  });
});

describe('skip', () => {
  test('作業をskipすると音を鳴らさずにskipした行を残し、休憩を全量で開始する', async () => {
    const app = await startTimer();

    await app.advance('0:10');
    await app.press('s');

    expect(app.terminal.lines()).toContain('⏩ Work skipped.');
    expect(frameOf(app)[0]).toBe('  ☕ BREAK                     Cycle 1 / 2');
    expect(clockOf(app)).toBe('1:00');
    expect(playsOf(app)).toEqual([]);
  });

  test('大文字のSでもskipし、Alt+sとCtrl+sは無視する', async () => {
    const app = await startTimer();

    await app.press('alt+s', 'ctrl+s');

    expect(frameOf(app)[0]).toContain('WORK');

    await app.press('S');

    expect(frameOf(app)[0]).toContain('BREAK');
  });

  test('最後の休憩をskipするとタイマーを完了し、完了通知の音を鳴らさずに終える', async () => {
    const app = await startTimer();

    await app.press('s', 's', 's', 's');

    expect(app.exitCode()).toBe(0);
    expect(app.terminal.lastLines(2)).toEqual(['⏩ Break skipped.', '🎉 Pomodoro complete.']);
    expect(app.log()).toEqual([
      '0:00.000 exit-code:0',
      '0:00.000 shutdown:complete',
      `0:00.000 schedule-exit:0:${COMPLETION_SHUTDOWN}`,
    ]);
    expect(app.terminal.cursorVisible()).toBe(true);
  });

  test('skipしたフェーズと自然終了したフェーズが混在しても、自然終了した分だけ音を鳴らす', async () => {
    const app = await startTimer();

    await app.advance('1:00');
    await app.press('s');
    await app.advance('0:30');
    await app.press('s');
    await app.advance('1:00');

    expect(playsOf(app)).toEqual(['1:00.000 play:work', '2:30.000 play:break:completion-notice']);
    expect(app.terminal.lines().filter((line) => /(?:complete|skipped)\.$/u.test(line))).toEqual([
      '✅ Work complete.',
      '⏩ Break skipped.',
      '⏩ Work skipped.',
      '✅ Break complete.',
      '🎉 Pomodoro complete.',
    ]);
  });
});

describe('終了', () => {
  test.each([
    { exitCode: 0, key: 'q', name: 'q' },
    { exitCode: 0, key: 'Q', name: 'Q' },
    { exitCode: 130, key: 'ctrl+c', name: 'Ctrl+C' },
  ])(
    '$nameでタイマーを止め、端末を元に戻して終了コード$exitCodeで終える',
    async ({ exitCode, key }) => {
      const app = await startTimer();

      await app.advance('0:10');
      await app.press(key);

      expect(app.exitCode()).toBe(exitCode);
      expect(app.log()).toEqual([
        `0:10.000 exit-code:${exitCode}`,
        '0:10.000 shutdown:abort',
        `0:10.000 schedule-exit:${exitCode}:${SHUTDOWN}`,
      ]);
      expect(app.terminal.cursorVisible()).toBe(true);
      expect(app.rawModes().at(-1)).toBe(false);
      expect(app.processListenerCount()).toBe(0);
      expect(app.terminal.resizeListenerCount()).toBe(0);
      expect(app.terminal.text()).not.toContain('Pomodoro complete.');
    },
  );

  test.each([
    { exitCode: 129, signal: 'SIGHUP' },
    { exitCode: 130, signal: 'SIGINT' },
    { exitCode: 143, signal: 'SIGTERM' },
  ] as const)(
    '$signalを受け取るとタイマーを止め、端末を元に戻して終了コード$exitCodeで終える',
    async ({ exitCode, signal }) => {
      const app = await startTimer();

      await app.advance('0:10');
      await app.signal(signal);

      expect(app.exitCode()).toBe(exitCode);
      expect(app.log()).toContain(`0:10.000 exit-code:${exitCode}`);
      expect(app.terminal.cursorVisible()).toBe(true);
      expect(app.processListenerCount()).toBe(0);
    },
  );

  test('期限を過ぎたフェーズがあるときのqは、そのフェーズを完了させてから止める', async () => {
    const app = await startTimer();

    // 次のtickが遅れ、作業の期限（1:00）を過ぎてからqが届く
    await app.advance('0:59.900');
    app.stall('0:00.200');
    await app.press('q');

    expect(app.exitCode()).toBe(0);
    expect(app.log()).toEqual([
      '1:00.100 play:work',
      '1:00.100 exit-code:0',
      '1:00.100 shutdown:abort',
      `1:00.100 schedule-exit:0:${SHUTDOWN}`,
    ]);
    expect(app.terminal.lines()).toContain('✅ Work complete.');
  });

  test('期限を過ぎた最後の休憩でqを押すと、終了より完了を優先する', async () => {
    const app = await startTimer();

    await app.advance('3:59.900');
    app.stall('0:00.200');
    await app.press('q');

    expect(app.exitCode()).toBe(0);
    expect(app.log()).toEqual([
      '1:00.000 play:work',
      '2:00.000 play:break',
      '3:00.000 play:work',
      '4:00.100 play:break:completion-notice',
      '4:00.100 exit-code:0',
      '4:00.100 shutdown:complete',
      `4:00.100 schedule-exit:0:${COMPLETION_SHUTDOWN}`,
    ]);
    expect(app.terminal.lastLines(1)).toEqual(['🎉 Pomodoro complete.']);
  });

  test('期限を過ぎたフェーズがあるときのskipは、そのフェーズを完了させてから次のフェーズを飛ばす', async () => {
    const app = await startTimer();

    await app.advance('0:59.900');
    app.stall('0:00.200');
    await app.press('s');

    expect(playsOf(app)).toEqual(['1:00.100 play:work']);
    expect(app.terminal.lines().filter((line) => /(?:complete|skipped)\.$/u.test(line))).toEqual([
      '✅ Work complete.',
      '⏩ Break skipped.',
    ]);
    expect(frameOf(app)[0]).toBe('  🍅 WORK                      Cycle 2 / 2');
  });
});

describe('完了', () => {
  test('既定の設定では各フェーズの終了時刻ちょうどに音を鳴らし、最後だけ完了通知とする', async () => {
    const app = await startScenario({ interactive: false });

    await app.press('enter');
    await app.advance('1:00:00');

    expect(app.exitCode()).toBe(0);
    expect(app.log()).toEqual([
      '15:00.000 play:work',
      '20:00.000 play:break',
      '35:00.000 play:work',
      '40:00.000 play:break',
      '55:00.000 play:work',
      '1:00:00.000 play:break:completion-notice',
      '1:00:00.000 exit-code:0',
      '1:00:00.000 shutdown:complete',
      `1:00:00.000 schedule-exit:0:${COMPLETION_SHUTDOWN}`,
    ]);
  });

  test('最後の休憩が終わると画面に完了を表示し、カーソルと入力を元に戻す', async () => {
    const app = await startTimer();

    await app.advance('3:59.750');

    expect(app.finished()).toBe(false);

    await app.advance('0:00.250');

    expect(app.exitCode()).toBe(0);
    expect(app.terminal.lastLines(5)).toEqual([
      '✅ Work complete.',
      '✅ Break complete.',
      '✅ Work complete.',
      '✅ Break complete.',
      '🎉 Pomodoro complete.',
    ]);
    expect(app.terminal.cursorVisible()).toBe(true);
    expect(app.rawModes()).toEqual([true, false, true, false]);
    expect(app.processListenerCount()).toBe(0);
    expect(app.terminal.resizeListenerCount()).toBe(0);
  });
});

describe('時刻のずれ', () => {
  test('OSのスリープで複数フェーズ分の時間が経っても、復帰時に現在のフェーズだけを完了する', async () => {
    const app = await startTimer();

    await app.advance('0:30');
    await app.suspend('1:00:00');

    expect(playsOf(app)).toEqual(['1:00:30.250 play:work']);
    expect(frameOf(app)[0]).toBe('  ☕ BREAK                     Cycle 1 / 2');
    expect(clockOf(app)).toBe('1:00');

    await app.advance('1:00');

    expect(playsOf(app)).toEqual(['1:00:30.250 play:work', '1:01:30.250 play:break']);
  });

  test('一時停止中のOSのスリープでは時間を経過させない', async () => {
    const app = await startTimer();

    await app.advance('0:30');
    await app.press('space');
    await app.suspend('1:00:00');
    await app.press('space');

    expect(clockOf(app)).toBe('0:30');
    expect(playsOf(app)).toEqual([]);
  });

  test('時計が戻っても経過率は0%に留まり、戻った分だけ長く待ってから完了する', async () => {
    const app = await startTimer();

    await app.advance('0:10');
    app.shiftClock(-30_000);
    await app.advance('0:00.250');

    expect(progressLineOf(app)).toBe('0:00 elapsed       0%         1:00 total');
    expect(clockOf(app)).toBe('1:20');

    await app.advance('1:20');

    expect(playsOf(app)).toEqual(['1:00.000 play:work']);
  });
});

describe('端末以外への出力', () => {
  test('標準入出力が端末でない場合は、フェーズの開始と完了を1行ずつ出力する', async () => {
    const app = await startScenario({ arguments_: SHORT, interactive: false });

    await app.press('enter');
    await app.advance('4:00');

    expect(app.exitCode()).toBe(0);
    expect(app.terminal.lines().slice(-9)).toEqual([
      '🍅 Work started (1 min)',
      '✅ Work complete.',
      '☕ Break started (1 min)',
      '✅ Break complete.',
      '🍅 Work started (1 min)',
      '✅ Work complete.',
      '☕ Break started (1 min)',
      '✅ Break complete.',
      '🎉 Pomodoro complete.',
    ]);
    expect(app.terminal.raw()).not.toContain('\u001B[?25l');
    expect(app.rawModes()).toEqual([]);
  });

  test('標準入出力が端末でない場合は、タイマー実行中のキーを読まない', async () => {
    const app = await startScenario({ arguments_: SHORT, interactive: false });

    await app.press('enter', 's', 'q', 'space');
    await app.advance('1:00');

    expect(app.finished()).toBe(false);
    expect(playsOf(app)).toEqual(['1:00.000 play:work']);
    expect(app.terminal.text()).not.toContain('skipped');
  });

  test('出力先が閉じたパイプになると、タイマーを止めて終了コード0で終える', async () => {
    const app = await startScenario({ arguments_: SHORT, interactive: false });

    await app.press('enter');
    await app.advance('0:30');
    app.terminal.emitError(Object.assign(new Error('write EPIPE'), { code: 'EPIPE' }));
    await app.advance('0:00.250');

    expect(app.exitCode()).toBe(0);
    expect(app.log()).toEqual([
      '0:30.000 exit-code:0',
      '0:30.000 shutdown:abort',
      `0:30.000 schedule-exit:0:${SHUTDOWN}`,
    ]);
  });
});
