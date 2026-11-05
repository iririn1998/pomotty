import { afterEach, describe, expect, test, vi } from 'vitest';
import type { StopReason, TimerView } from './progress-view.ts';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import type { TimerControls } from '#src/timer/timer.ts';
import type { TimerState } from '#src/timer/state.ts';
import { createProgressView } from './progress-view.ts';
import { createVirtualTerminal } from '#src/terminal/virtual-terminal.test-helper.ts';
import type { VirtualTerminal } from '#src/terminal/virtual-terminal.test-helper.ts';

const SETTINGS = { breakDurationMs: 60_000, loopCount: 2, workDurationMs: 120_000 },
  NOW = 1_700_000_000_000,
  RUNNING: TimerState = {
    completedPomodoros: 0,
    cycle: 1,
    endsAt: NOW + 120_000,
    paused: false,
    phase: 'work',
    remainingMs: 0,
  },
  /** TTYかどうかを指定でき、raw modeの切り替えを記録する標準入力を作成します。 */
  createInput = (
    isTTY: boolean,
  ): PassThrough & { readonly isTTY: boolean; readonly rawModes: readonly boolean[] } => {
    const rawModes: boolean[] = [];

    return Object.assign(new PassThrough(), {
      isTTY,
      rawModes,
      setRawMode(this: PassThrough, mode: boolean) {
        rawModes.push(mode);
        return this;
      },
    });
  },
  /** 操作の呼び出しを記録する偽のタイマー操作を作成します。 */
  createControls = (settleResult = false): TimerControls & { readonly calls: string[] } => {
    const calls: string[] = [];

    return {
      calls,
      settle: () => {
        calls.push('settle');
        return settleResult;
      },
      skip: () => {
        calls.push('skip');
      },
      togglePause: () => {
        calls.push('toggle-pause');
      },
    };
  },
  /** 指定した条件でタイマーの進行の表示を作成します。 */
  createView = ({
    color,
    interactive,
    stdinIsTTY = true,
    stdoutIsTTY = true,
  }: {
    readonly color?: boolean;
    readonly interactive?: boolean;
    readonly stdinIsTTY?: boolean;
    readonly stdoutIsTTY?: boolean;
  } = {}): {
    readonly processEvents: EventEmitter;
    readonly stdin: ReturnType<typeof createInput>;
    readonly stops: readonly StopReason[];
    readonly terminal: VirtualTerminal;
    readonly view: TimerView;
  } => {
    const terminal = createVirtualTerminal({ isTTY: stdoutIsTTY }),
      stdin = createInput(stdinIsTTY),
      processEvents = new EventEmitter(),
      stops: StopReason[] = [],
      view: TimerView = createProgressView({
        color,
        interactive,
        onStop: (reason) => {
          stops.push(reason);
        },
        processEvents,
        settings: SETTINGS,
        stdin,
        stdout: terminal,
        write: (output) => {
          terminal.write(output);
        },
      });

    return { processEvents, stdin, stops, terminal, view };
  },
  /** キーの復号を待ちます。 */
  flush = (): Promise<void> =>
    new Promise((resolve) => {
      setImmediate(resolve);
    });

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('表示の選択', () => {
  test.each([
    { expected: 'interactive', stdinIsTTY: true, stdoutIsTTY: true, term: 'xterm-256color' },
    { expected: 'line', stdinIsTTY: true, stdoutIsTTY: true, term: 'dumb' },
    { expected: 'line', stdinIsTTY: false, stdoutIsTTY: true, term: 'xterm' },
    { expected: 'line', stdinIsTTY: true, stdoutIsTTY: false, term: 'xterm' },
  ])(
    'stdinのTTY=$stdinIsTTY、stdoutのTTY=$stdoutIsTTY、TERM=$termでは$expected表示にする',
    ({ expected, stdinIsTTY, stdoutIsTTY, term }) => {
      vi.stubEnv('TERM', term);

      const { terminal, view } = createView({ stdinIsTTY, stdoutIsTTY });

      view.onPhaseStarted('work', SETTINGS.workDurationMs);
      view.onTick?.(RUNNING, NOW);
      view.finish();

      if (expected === 'line') {
        expect(terminal.lines()).toEqual(['🍅 Work started (2 min)']);
      } else {
        expect(terminal.lines()[0]).toBe('  🍅 WORK                      Cycle 1 / 2');
      }
    },
  );

  test('interactiveを指定した場合は端末の判定より優先する', () => {
    const forcedLine = createView({ interactive: false }),
      forcedInteractive = createView({ interactive: true, stdinIsTTY: false, stdoutIsTTY: false });

    forcedLine.view.onPhaseStarted('break', SETTINGS.breakDurationMs);
    forcedInteractive.view.onTick?.(RUNNING, NOW);

    expect(forcedLine.terminal.lines()).toEqual(['☕ Break started (1 min)']);
    expect(forcedInteractive.terminal.lines()[0]).toContain('WORK');
  });

  test.each([
    { colored: false, noColor: '1' },
    { colored: true, noColor: '' },
  ])('NO_COLOR=$noColorなら色を付けるかの既定値は$coloredとする', ({ colored, noColor }) => {
    vi.stubEnv('NO_COLOR', noColor);

    const { terminal, view } = createView({ interactive: true });

    view.onTick?.(RUNNING, NOW);

    expect(terminal.raw().includes('\u001B[31m')).toBe(colored);
  });
});

describe('1行ずつの表示', () => {
  test('フェーズの開始と完了だけを出力し、skipとtickでは何も出力しない', () => {
    const { terminal, view } = createView({ interactive: false });

    view.onPhaseStarted('work', SETTINGS.workDurationMs);
    view.onTick?.(RUNNING, NOW);
    view.onPhaseSkipped?.('work');
    view.onPhaseCompleted('break');
    view.finish();

    expect(terminal.lines()).toEqual(['🍅 Work started (2 min)', '✅ Break complete.']);
  });
});

describe('残り時間の画面のキー操作', () => {
  test.each([
    { calls: ['toggle-pause'], key: ' ', stops: [] },
    { calls: ['skip'], key: 's', stops: [] },
    { calls: ['settle'], key: 'q', stops: ['quit'] },
    { calls: ['settle'], key: '\u0003', stops: ['interrupt'] },
  ])('$keyを押すと操作$callsを呼び、$stopsで止める', async ({ calls, key, stops }) => {
    const { stdin, stops: actualStops, view } = createView({ interactive: true }),
      controls = createControls();

    view.bindControls?.(controls);
    stdin.write(key);
    await flush();
    view.finish();

    expect(controls.calls).toEqual(calls);
    expect(actualStops).toEqual(stops);
  });

  test('精算でタイマーが完了した場合は、qとCtrl+Cで止めない', async () => {
    const { stdin, stops, view } = createView({ interactive: true }),
      controls = createControls(true);

    view.bindControls?.(controls);
    stdin.write('q\u0003');
    await flush();
    view.finish();

    expect(controls.calls).toEqual(['settle', 'settle']);
    expect(stops).toEqual([]);
  });

  test('タイマー操作を受け取る前のキーは無視する', async () => {
    const { stdin, stops, view } = createView({ interactive: true });

    stdin.write('q');
    await flush();
    view.finish();

    expect(stops).toEqual([]);
  });

  test('シグナルではタイマーを精算せずに止める', () => {
    const { processEvents, stops, view } = createView({ interactive: true }),
      controls = createControls();

    view.bindControls?.(controls);
    processEvents.emit('SIGTERM');
    view.finish();

    expect(controls.calls).toEqual([]);
    expect(stops).toEqual(['SIGTERM']);
  });

  test('終了後はキー、シグナル、端末幅の変更を受け付けず、raw modeとカーソルを元に戻す', async () => {
    const { processEvents, stdin, stops, terminal, view } = createView({ interactive: true }),
      controls = createControls();

    view.bindControls?.(controls);
    view.onTick?.(RUNNING, NOW);
    view.finish();
    stdin.write('q');
    await flush();
    processEvents.emit('SIGINT');

    expect(controls.calls).toEqual([]);
    expect(stops).toEqual([]);
    expect(stdin.rawModes).toEqual([true, false]);
    expect(terminal.cursorVisible()).toBe(true);
    expect(terminal.resizeListenerCount()).toBe(0);
    expect(processEvents.eventNames()).toEqual([]);
  });
});

describe('残り時間の画面の描画', () => {
  test('tickの前は何も描画せず、最初のtickでカーソルを隠して画面を描画する', () => {
    const { terminal, view } = createView({ interactive: true });

    view.onPhaseStarted('work', SETTINGS.workDurationMs);

    expect(terminal.raw()).toBe('');

    view.onTick?.(RUNNING, NOW);
    view.finish();

    expect(terminal.raw().startsWith('\u001B[?25l')).toBe(true);
    expect(terminal.lines()).toHaveLength(16);
  });

  test('内容が変わらないtickでは何も書き込まない', () => {
    const { terminal, view } = createView({ interactive: true });

    view.onTick?.(RUNNING, NOW);

    const written = terminal.raw();

    view.onTick?.(RUNNING, NOW + 250);
    view.onTick?.(RUNNING, NOW + 500);

    expect(terminal.raw()).toBe(written);

    view.onTick?.(RUNNING, NOW + 1000);
    view.finish();

    expect(terminal.raw()).not.toBe(written);
  });

  test('完了とskipは画面を消して1行で残し、次のtickで画面をその下へ描画する', () => {
    const { terminal, view } = createView({ interactive: true });

    view.onTick?.(RUNNING, NOW);
    view.onPhaseCompleted('work');

    expect(terminal.lines()).toEqual(['✅ Work complete.']);

    view.onPhaseSkipped?.('break');
    view.onTick?.(RUNNING, NOW);
    view.finish();

    expect(terminal.lines().slice(0, 3)).toEqual([
      '✅ Work complete.',
      '⏩ Break skipped.',
      '  🍅 WORK                      Cycle 1 / 2',
    ]);
  });

  test('端末幅が変わると直前の状態で新しい幅の画面を追記する', () => {
    const { terminal, view } = createView({ interactive: true });

    terminal.resize(30);

    expect(terminal.raw()).toBe('');

    view.onTick?.(RUNNING, NOW);
    terminal.resize(80);
    view.finish();

    expect(terminal.lines()).toHaveLength(4 + 16);
    expect(terminal.lines()[0]).toBe('🍅 WORK  1/2');
    expect(terminal.lines()[4]).toBe('  🍅 WORK                      Cycle 1 / 2');
  });
});
