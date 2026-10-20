import { afterEach, describe, expect, test, vi } from 'vitest';
import type { ProgressViewParameters, StopReason, TimerView } from './progress-view.ts';
import type { TimerSettings, TimerState } from '#src/timer/state.ts';
import { EventEmitter } from 'node:events';
import type { OutputStream } from '#src/terminal/output.ts';
import { PassThrough } from 'node:stream';
import type { TimerControls } from '#src/timer/timer.ts';
import { createProgressView } from './progress-view.ts';
import { setImmediate as waitForIo } from 'node:timers/promises';

type FakeInput = PassThrough & {
  readonly isTTY: boolean;
  readonly rawModes: boolean[];
  readonly setRawMode: (mode: boolean) => PassThrough;
};

type FakeTerminal = OutputStream & {
  columns: number;
  readonly emitter: EventEmitter;
};

type ViewHarness = {
  readonly controls: string[];
  readonly input: FakeInput;
  readonly processEvents: EventEmitter;
  readonly stops: StopReason[];
  readonly terminal: FakeTerminal;
  readonly view: TimerView;
  readonly writes: string[];
};

const MINUTE_MS = 60_000,
  NOW = 1_700_000_000_000,
  HIDE_CURSOR = '\u001B[?25l',
  SHOW_CURSOR = '\u001B[?25h',
  SETTINGS: TimerSettings = {
    breakDurationMs: 5 * MINUTE_MS,
    loopCount: 3,
    workDurationMs: 15 * MINUTE_MS,
  },
  stateAt = (remainingMs: number, overrides: Partial<TimerState> = {}): TimerState => ({
    completedPomodoros: 0,
    cycle: 1,
    endsAt: NOW + remainingMs,
    paused: false,
    phase: 'work',
    remainingMs: 0,
    ...overrides,
  }),
  createInput = (isTTY = true): FakeInput => {
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
  createTerminal = (isTTY = true): FakeTerminal => {
    const emitter = new EventEmitter();

    return {
      columns: 80,
      emitter,
      isTTY,
      off: (event, listener) => emitter.off(event, listener),
      on: (event, listener) => emitter.on(event, listener),
      write: () => true,
    };
  },
  /** 偽の端末と入力で、タイマーの進行の表示を作成します。 */
  createHarness = (
    overrides: Partial<ProgressViewParameters> = {},
    { settle = false }: { readonly settle?: boolean } = {},
  ): ViewHarness => {
    const controls: string[] = [],
      input = createInput(),
      processEvents = new EventEmitter(),
      stops: StopReason[] = [],
      terminal = createTerminal(),
      writes: string[] = [],
      view = createProgressView({
        color: false,
        interactive: true,
        onStop: (reason) => {
          stops.push(reason);
        },
        processEvents: {
          off: (event, listener) => processEvents.off(event, listener),
          on: (event, listener) => processEvents.on(event, listener),
        },
        settings: SETTINGS,
        stdin: input,
        stdout: terminal,
        write: (output) => {
          writes.push(output);
        },
        ...overrides,
      });

    const timerControls: TimerControls = {
      settle: () => {
        controls.push('settle');
        return settle;
      },
      skip: () => {
        controls.push('skip');
      },
      togglePause: () => {
        controls.push('toggle-pause');
      },
    };

    view.bindControls?.(timerControls);

    return { controls, input, processEvents, stops, terminal, view, writes };
  },
  pressKeys = async (input: FakeInput, keys: string): Promise<void> => {
    input.write(keys);
    await waitForIo();
  };

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('1行ずつ出力する表示', () => {
  const createLineView = (): { readonly view: TimerView; readonly writes: string[] } => {
    const writes: string[] = [],
      view = createProgressView({
        interactive: false,
        onStop: () => {
          throw new Error('unexpected stop');
        },
        settings: SETTINGS,
        stdin: createInput(),
        stdout: createTerminal(),
        write: (output) => {
          writes.push(output);
        },
      });

    return { view, writes };
  };

  test('フェーズの開始を長さ付きで、完了をフェーズ名で1行ずつ出力する', () => {
    const { view, writes } = createLineView();

    view.onPhaseStarted('work', 25 * MINUTE_MS);
    view.onPhaseCompleted('work');
    view.onPhaseStarted('break', 5 * MINUTE_MS);
    view.onPhaseCompleted('break');

    expect(writes).toEqual([
      '🍅 Work started (25 min)\n',
      '✅ Work complete.\n',
      '☕ Break started (5 min)\n',
      '✅ Break complete.\n',
    ]);
  });

  test('残り時間の描画とキー操作を受け付けず、終了時に何も出力しない', () => {
    const { view, writes } = createLineView();

    view.finish();

    expect(view.onTick).toBeUndefined();
    expect(view.bindControls).toBeUndefined();
    expect(view.onPhaseSkipped).toBeUndefined();
    expect(writes).toEqual([]);
  });

  test('入力、端末、プロセスにリスナーを登録しない', () => {
    const input = createInput(),
      terminal = createTerminal(),
      processEvents = new EventEmitter();

    createProgressView({
      interactive: false,
      onStop: vi.fn<() => void>(),
      processEvents: {
        off: (event, listener) => processEvents.off(event, listener),
        on: (event, listener) => processEvents.on(event, listener),
      },
      settings: SETTINGS,
      stdin: input,
      stdout: terminal,
      write: vi.fn<() => void>(),
    });

    expect(input.listenerCount('keypress')).toBe(0);
    expect(input.rawModes).toEqual([]);
    expect(terminal.emitter.eventNames()).toEqual([]);
    expect(processEvents.eventNames()).toEqual([]);
  });
});

describe('表示の選択', () => {
  test.each([
    { expected: true, stdinTTY: true, stdoutTTY: true, term: 'xterm-256color' },
    { expected: true, stdinTTY: true, stdoutTTY: true, term: undefined },
    { expected: false, stdinTTY: false, stdoutTTY: true, term: 'xterm-256color' },
    { expected: false, stdinTTY: true, stdoutTTY: false, term: 'xterm-256color' },
    { expected: false, stdinTTY: true, stdoutTTY: true, term: 'dumb' },
  ])(
    'stdinのTTY=$stdinTTY、stdoutのTTY=$stdoutTTY、TERM=$termでは画面の描き直しが$expectedである',
    ({ expected, stdinTTY, stdoutTTY, term }) => {
      vi.stubEnv('TERM', term);

      const input = createInput(stdinTTY),
        view = createProgressView({
          onStop: vi.fn<() => void>(),
          processEvents: new EventEmitter(),
          settings: SETTINGS,
          stdin: input,
          stdout: createTerminal(stdoutTTY),
          write: vi.fn<() => void>(),
        });

      expect(view.onTick !== undefined).toBe(expected);
      view.finish();
    },
  );

  test.each([
    { interactive: true, tty: false },
    { interactive: false, tty: true },
  ])('interactive=$interactiveの指定は端末の判定より優先する', ({ interactive, tty }) => {
    const view = createProgressView({
      interactive,
      onStop: vi.fn<() => void>(),
      processEvents: new EventEmitter(),
      settings: SETTINGS,
      stdin: createInput(tty),
      stdout: createTerminal(tty),
      write: vi.fn<() => void>(),
    });

    expect(view.onTick !== undefined).toBe(interactive);
    view.finish();
  });
});

describe('残り時間の画面', () => {
  test('最初のtickでカーソルを隠してから画面を描画する', () => {
    const { view, writes } = createHarness();

    view.onTick?.(stateAt(5 * MINUTE_MS), NOW);

    expect(writes[0]).toBe(HIDE_CURSOR);
    expect(writes[1]?.startsWith(`\u001B[2K  🍅 WORK${' '.repeat(22)}Cycle 1 / 3\n`)).toBe(true);
    expect(writes).toHaveLength(2);
    view.finish();
  });

  test('表示が変わらないtickでは書き込まず、変わった場合だけ描き直す', () => {
    const { view, writes } = createHarness();

    view.onTick?.(stateAt(5 * MINUTE_MS), NOW);
    view.onTick?.(stateAt(5 * MINUTE_MS - 100), NOW);
    view.onTick?.(stateAt(5 * MINUTE_MS - 1000), NOW);

    expect(writes).toHaveLength(3);
    expect(writes[2]?.startsWith('\u001B[17A')).toBe(true);
    view.finish();
  });

  test('フェーズの開始は画面に含めて行として出力しない', () => {
    const { view, writes } = createHarness();

    view.onPhaseStarted('break', 5 * MINUTE_MS);

    expect(writes).toEqual([]);
    view.finish();
  });

  test('フェーズの完了とskipは画面を消してから1行で残す', () => {
    const { view, writes } = createHarness();

    view.onTick?.(stateAt(5 * MINUTE_MS), NOW);
    view.onPhaseCompleted('work');
    view.onPhaseSkipped?.('break');

    expect(writes.slice(2)).toEqual([
      `\u001B[17A${'\u001B[2K\n'.repeat(17)}\u001B[17A✅ Work complete.\n`,
      '⏩ Break skipped.\n',
    ]);
    view.finish();
  });

  test('色が有効な場合だけフェーズの色で描画する', () => {
    const colored = createHarness({ color: true }),
      plain = createHarness({ color: false });

    colored.view.onTick?.(stateAt(5 * MINUTE_MS), NOW);
    plain.view.onTick?.(stateAt(5 * MINUTE_MS), NOW);

    expect(colored.writes[1]).toContain('\u001B[31m🍅 WORK\u001B[39m');
    expect(plain.writes[1]).not.toContain('\u001B[3');
    colored.view.finish();
    plain.view.finish();
  });

  test.each([
    { color: false, noColor: '1' },
    { color: true, noColor: '' },
  ])('色の指定を省略した場合はNO_COLOR=$noColorから色を$colorとする', ({ color, noColor }) => {
    vi.stubEnv('NO_COLOR', noColor);

    const { view, writes } = createHarness({ color: undefined });

    view.onTick?.(stateAt(5 * MINUTE_MS), NOW);

    expect(writes[1]?.includes('\u001B[31m')).toBe(color);
    view.finish();
  });

  test('端末幅が変わると旧画面を消さずに新しい幅の画面を追記する', () => {
    const { terminal, view, writes } = createHarness();

    view.onTick?.(stateAt(5 * MINUTE_MS), NOW);
    terminal.columns = 30;
    terminal.emitter.emit('resize');

    expect(writes[2]).toBe(
      '\u001B[2K🍅 WORK  1/3\n\u001B[2K5:00 left · 66%\n\u001B[2K━━━━━━━━━━━━━━━━━━━──────────\n\u001B[2K[sp]pause [s]skip [q]quit\n',
    );
    view.finish();
  });

  test('最初のtickより前に端末幅が変わっても何も描画しない', () => {
    const { terminal, view, writes } = createHarness();

    terminal.emitter.emit('resize');

    expect(writes).toEqual([]);
    view.finish();
  });
});

describe('キー操作', () => {
  test('spaceで一時停止を切り替え、sでskipする', async () => {
    const { controls, input, stops, view } = createHarness();

    await pressKeys(input, ' sS');

    expect(controls).toEqual(['toggle-pause', 'skip', 'skip']);
    expect(stops).toEqual([]);
    view.finish();
  });

  test.each([
    { key: 'q', reason: 'quit' },
    { key: 'Q', reason: 'quit' },
    { key: '\u0003', reason: 'interrupt' },
  ])('$reasonの操作では期限到達済みのフェーズを精算してから止める', async ({ key, reason }) => {
    const { controls, input, stops, view } = createHarness();

    await pressKeys(input, key);

    expect(controls).toEqual(['settle']);
    expect(stops).toEqual([reason]);
    view.finish();
  });

  test('精算でタイマーが完了した場合は止めない', async () => {
    const { controls, input, stops, view } = createHarness({}, { settle: true });

    await pressKeys(input, 'q\u0003');

    expect(controls).toEqual(['settle', 'settle']);
    expect(stops).toEqual([]);
    view.finish();
  });

  test('タイマーの操作を受け取る前のキーは無視する', async () => {
    const input = createInput(),
      stops: StopReason[] = [],
      view = createProgressView({
        color: false,
        interactive: true,
        onStop: (reason) => {
          stops.push(reason);
        },
        processEvents: new EventEmitter(),
        settings: SETTINGS,
        stdin: input,
        stdout: createTerminal(),
        write: vi.fn<() => void>(),
      });

    await pressKeys(input, 'q\u0003 s');

    expect(stops).toEqual([]);
    view.finish();
  });

  test('対応しないキーは無視する', async () => {
    const { controls, input, stops, view } = createHarness();

    await pressKeys(input, 'ax\r\u001B[A');

    expect(controls).toEqual([]);
    expect(stops).toEqual([]);
    view.finish();
  });
});

describe('シグナル', () => {
  test.each(['SIGHUP', 'SIGINT', 'SIGTERM'] as const)(
    '%sを受け取ると精算せずに止める',
    (signal) => {
      const { controls, processEvents, stops, view } = createHarness();

      processEvents.emit(signal);

      expect(stops).toEqual([signal]);
      expect(controls).toEqual([]);
      view.finish();
    },
  );
});

describe('終了', () => {
  test('入力の監視、端末幅とシグナルのリスナーを解除し、カーソルとraw modeを元に戻す', async () => {
    const { controls, input, processEvents, stops, terminal, view, writes } = createHarness();

    view.onTick?.(stateAt(5 * MINUTE_MS), NOW);
    view.finish();

    expect(writes.at(-1)).toBe(SHOW_CURSOR);
    expect(input.rawModes).toEqual([true, false]);
    expect(input.listenerCount('keypress')).toBe(0);
    expect(terminal.emitter.listenerCount('resize')).toBe(0);
    expect(processEvents.eventNames()).toEqual([]);

    const writeCount = writes.length;

    terminal.emitter.emit('resize');
    processEvents.emit('SIGTERM');
    input.resume();
    await pressKeys(input, 'q');

    expect(writes).toHaveLength(writeCount);
    expect(stops).toEqual([]);
    expect(controls).toEqual([]);
  });

  test('画面を描画していなければカーソルを表示し直さない', () => {
    const { view, writes } = createHarness();

    view.finish();

    expect(writes).toEqual([]);
  });

  test('複数回呼んでも端末の状態を1回だけ元に戻す', () => {
    const { input, view, writes } = createHarness();

    view.onTick?.(stateAt(5 * MINUTE_MS), NOW);
    view.finish();
    view.finish();

    expect(writes.filter((output) => output === SHOW_CURSOR)).toHaveLength(1);
    expect(input.rawModes).toEqual([true, false]);
  });

  test('リスナーを解除できない端末でも終了できる', () => {
    const terminal = { ...createTerminal(), off: undefined },
      view = createProgressView({
        color: false,
        interactive: true,
        onStop: vi.fn<() => void>(),
        processEvents: new EventEmitter(),
        settings: SETTINGS,
        stdin: createInput(),
        stdout: terminal,
        write: vi.fn<() => void>(),
      });

    expect(() => {
      view.finish();
    }).not.toThrow();
  });
});
