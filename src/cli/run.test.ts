import {
  COMPLETION_SHUTDOWN_DEADLINE_MS,
  INTERRUPTED_EXIT_CODE,
  SHUTDOWN_DEADLINE_MS,
  runCli,
} from './run.ts';
import type { ConfirmStartParameters, RunCliParameters } from './run.ts';
import { DEFAULT_BREAK_DURATION_MS, DEFAULT_WORK_DURATION_MS } from '#src/timer/timer.ts';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { LOGO } from '#src/terminal/constants.ts';
import type { OutputStream } from '#src/terminal/output.ts';
import type { ProcessEvents } from '#src/terminal/terminal-guard.ts';
import type { SoundPlayer } from '#src/notification/sound.ts';
import process from 'node:process';

type FakeStdout = OutputStream & {
  readonly emitError: (error: unknown) => void;
  readonly output: () => string;
};

type CliHarness = {
  readonly events: string[];
  readonly parameters: RunCliParameters;
  readonly stdout: FakeStdout;
};

type CliResult = {
  readonly elapsedMs: number;
  readonly errorOutput: string;
  readonly events: readonly string[];
  readonly exitCode: number;
  readonly output: string;
};

const MINUTE_MS = 60_000,
  START_TIME = 1_700_000_000_000,
  help =
    'Pomotty CLI\n\nUsage: pomotty [OPTIONS]\n\nOptions:\n  --work <minutes>\n          Work duration in minutes (1-1440, default: 15)\n  --break <minutes>\n          Break duration in minutes (1-1440, default: 5)\n  --loop <count>\n          Work-break repetitions (positive integer, default: 3)\n  -h, --help\n          Print help\n',
  brokenPipe = (): Error => Object.assign(new Error('write EPIPE'), { code: 'EPIPE' }),
  /** 書き込みを記録し、`error`イベントを発生させられる偽の標準出力を作成します。 */
  createStdout = (failWrite?: (output: string) => void): FakeStdout => {
    const emitter = new EventEmitter();
    let output = '';

    return {
      emitError: (error) => {
        emitter.emit('error', error);
      },
      on: (event, listener) => emitter.on(event, listener),
      output: () => output,
      write: (value) => {
        failWrite?.(value);
        output += value;
        return true;
      },
    };
  },
  /**
   * 偽の時計、標準出力、再生処理でCLIを実行する準備をします。
   *
   * `events`には開始確認、再生、終了処理などの呼び出しを順番に記録します。
   */
  createHarness = (
    arguments_: readonly string[] = [],
    overrides: Partial<RunCliParameters> = {},
    stdout: FakeStdout = createStdout(),
  ): CliHarness & { readonly clock: () => number; errorOutput: () => string } => {
    const events: string[] = [];
    let currentTime = START_TIME,
      errorOutput = '';

    const soundPlayer: SoundPlayer = {
      play: (phase, { completionNotice = false } = {}) => {
        events.push(`play:${phase}${completionNotice ? ':completion-notice' : ''}`);
      },
      shutdown: ({ complete }) => {
        events.push(`shutdown:${complete ? 'complete' : 'abort'}`);
        return Promise.resolve();
      },
    };

    return {
      clock: () => currentTime - START_TIME,
      errorOutput: () => errorOutput,
      events,
      parameters: {
        arguments_,
        confirmStart: () => {
          events.push('confirm');
          return Promise.resolve(true);
        },
        createSoundPlayer: () => {
          events.push('create-sound-player');
          return soundPlayer;
        },
        now: () => currentTime,
        scheduleExit: (exitCode, delayMs) => {
          events.push(`schedule-exit:${exitCode}:${delayMs}`);
        },
        setExitCode: (exitCode) => {
          events.push(`set-exit-code:${exitCode}`);
        },
        sleep: (durationMs) => {
          currentTime += durationMs;
          return Promise.resolve();
        },
        stdout,
        writeError: (value) => {
          errorOutput += value;
        },
        ...overrides,
      },
      stdout,
    };
  },
  runCliFor = async (
    arguments_: readonly string[] = [],
    overrides: Partial<RunCliParameters> = {},
  ): Promise<CliResult> => {
    const harness = createHarness(arguments_, overrides),
      exitCode = await runCli(harness.parameters);

    return {
      elapsedMs: harness.clock(),
      errorOutput: harness.errorOutput(),
      events: harness.events,
      exitCode,
      output: harness.stdout.output(),
    };
  };

test('オプションなしで15分の作業と5分の休憩を3回実行する', async () => {
  const result = await runCliFor();

  expect(result).toEqual({
    elapsedMs: 3 * (DEFAULT_WORK_DURATION_MS + DEFAULT_BREAK_DURATION_MS),
    errorOutput: '',
    events: [
      'create-sound-player',
      'confirm',
      'play:work',
      'play:break',
      'play:work',
      'play:break',
      'play:work',
      'play:break:completion-notice',
      'set-exit-code:0',
      'shutdown:complete',
      `schedule-exit:0:${COMPLETION_SHUTDOWN_DEADLINE_MS}`,
    ],
    exitCode: 0,
    output: [
      `${LOGO}\n`,
      '🍅 Work started (15 min)\n',
      '✅ Work complete.\n',
      '☕ Break started (5 min)\n',
      '✅ Break complete.\n',
      '🍅 Work started (15 min)\n',
      '✅ Work complete.\n',
      '☕ Break started (5 min)\n',
      '✅ Break complete.\n',
      '🍅 Work started (15 min)\n',
      '✅ Work complete.\n',
      '☕ Break started (5 min)\n',
      '✅ Break complete.\n',
      '🎉 Pomodoro complete.\n',
    ].join(''),
  });
});

test.each([
  {
    arguments_: ['--work', '30', '--break', '10', '--loop', '1'],
    elapsedMs: 40 * MINUTE_MS,
    name: '分離形式',
  },
  {
    arguments_: ['--work=45', '--break=15', '--loop=2'],
    elapsedMs: 120 * MINUTE_MS,
    name: 'イコール形式',
  },
])('$nameで指定した時間と回数でタイマーを実行する', async ({ arguments_, elapsedMs }) => {
  const result = await runCliFor(arguments_);

  expect(result.elapsedMs).toBe(elapsedMs);
  expect(result.errorOutput).toBe('');
  expect(result.exitCode).toBe(0);
  expect(result.events.filter((event) => event === 'confirm')).toEqual(['confirm']);
});

test('不正な繰り返し回数では再生コマンドの解決も開始確認もタイマーも実行しない', async () => {
  const result = await runCliFor(['--loop', '0']);

  expect(result).toEqual({
    elapsedMs: 0,
    errorOutput: `Error: --loop requires an integer from 1 to ${Number.MAX_SAFE_INTEGER}.\n`,
    events: [],
    exitCode: 2,
    output: '',
  });
});

test.each(['--help', '-h'])('%sでヘルプを表示してタイマーを開始しない', async (option) => {
  const result = await runCliFor([option]);

  expect(result).toEqual({
    elapsedMs: 0,
    errorOutput: '',
    events: [],
    exitCode: 0,
    output: help,
  });
});

test('未知のオプションではエラー終了しタイマーを開始しない', async () => {
  const result = await runCliFor(['--unknown']);

  expect(result).toEqual({
    elapsedMs: 0,
    errorOutput: 'Error: Unknown option: "--unknown"\n',
    events: [],
    exitCode: 2,
    output: '',
  });
});

test('診断の書き込みが同期的に失敗しても終了コード2を保つ', async () => {
  const result = await runCliFor(['--unknown'], {
    writeError: () => {
      throw new Error('stderr is closed');
    },
  });

  expect(result).toMatchObject({ elapsedMs: 0, events: [], exitCode: 2, output: '' });
});

test('NGを選択するとタイマーを開始せず、再生処理を終了する', async () => {
  const result = await runCliFor([], { confirmStart: () => Promise.resolve(false) });

  expect(result).toEqual({
    elapsedMs: 0,
    errorOutput: '',
    events: [
      'create-sound-player',
      'set-exit-code:0',
      'shutdown:abort',
      `schedule-exit:0:${SHUTDOWN_DEADLINE_MS}`,
    ],
    exitCode: 0,
    output: `${LOGO}\n⏹️ Work was not started.\n`,
  });
});

test('開始確認には中断シグナルと標準出力の書き込み処理を渡す', async () => {
  let received: ConfirmStartParameters | undefined;
  const harness = createHarness([], {
    confirmStart: (parameters) => {
      received = parameters;
      parameters.write('menu');
      return Promise.resolve(false);
    },
  });

  await runCli(harness.parameters);

  expect(received?.signal.aborted).toBe(true);
  expect(harness.stdout.output()).toBe(`${LOGO}\nmenu⏹️ Work was not started.\n`);
});

test.each([
  { error: brokenPipe(), exitCode: 0, name: 'EPIPE' },
  { error: new Error('write EIO'), exitCode: 1, name: 'その他のエラー' },
])('ヘルプ表示後の非同期の$nameで終了コードを$exitCodeにする', async ({ error, exitCode }) => {
  const harness = createHarness(['--help']);

  expect(await runCli(harness.parameters)).toBe(0);

  harness.stdout.emitError(error);

  expect(harness.events).toEqual([`set-exit-code:${exitCode}`]);
});

test.each([
  { error: brokenPipe(), exitCode: 0, name: 'EPIPE' },
  { error: new Error('stream destroyed'), exitCode: 1, name: 'その他のエラー' },
])(
  'ヘルプの同期的な書き込み失敗が$nameなら終了コード$exitCodeを返す',
  async ({ error, exitCode }) => {
    const stdout = createStdout(() => {
        throw error;
      }),
      harness = createHarness(['--help'], {}, stdout);

    expect(await runCli(harness.parameters)).toBe(exitCode);
  },
);

test.each([
  { error: brokenPipe(), exitCode: 0, name: 'EPIPE' },
  { error: new Error('write EIO'), exitCode: 1, name: 'その他のエラー' },
])(
  'タイマー実行中の標準出力の$nameでタイマーを中断し、終了コード$exitCodeで終える',
  async ({ error, exitCode }) => {
    const stdout = createStdout(),
      harness = createHarness(
        [],
        {
          sleep: () => {
            stdout.emitError(error);
            return Promise.resolve();
          },
        },
        stdout,
      );

    expect(await runCli(harness.parameters)).toBe(exitCode);
    expect(harness.events).toEqual([
      'create-sound-player',
      'confirm',
      `set-exit-code:${exitCode}`,
      'shutdown:abort',
      `schedule-exit:${exitCode}:${SHUTDOWN_DEADLINE_MS}`,
    ]);
    expect(stdout.output()).toBe(`${LOGO}\n🍅 Work started (15 min)\n`);
  },
);

test('開始確認中に標準出力がEPIPEになると確認を中断し、サマリなしで終了コード0とする', async () => {
  const stdout = createStdout(),
    harness = createHarness(
      [],
      {
        confirmStart: ({ signal }) =>
          new Promise((resolve) => {
            signal.addEventListener('abort', () => {
              resolve(false);
            });
            stdout.emitError(brokenPipe());
          }),
      },
      stdout,
    );

  expect(await runCli(harness.parameters)).toBe(0);
  expect(stdout.output()).toBe(`${LOGO}\n`);
  expect(harness.events).toEqual([
    'create-sound-player',
    'set-exit-code:0',
    'shutdown:abort',
    `schedule-exit:0:${SHUTDOWN_DEADLINE_MS}`,
  ]);
});

test('完了後の標準出力のエラーは決定済みの終了コードを変更しない', async () => {
  const harness = createHarness(['--loop', '1']);

  expect(await runCli(harness.parameters)).toBe(0);

  harness.stdout.emitError(new Error('write EIO'));

  expect(harness.events.filter((event) => event.startsWith('set-exit-code'))).toEqual([
    'set-exit-code:0',
  ]);
});

test('実行中の例外では再生処理を終了してから例外を伝える', async () => {
  const failure = new Error('stdin failed'),
    harness = createHarness([], { confirmStart: () => Promise.reject(failure) });

  await expect(runCli(harness.parameters)).rejects.toBe(failure);
  expect(harness.events).toEqual([
    'create-sound-player',
    'set-exit-code:1',
    'shutdown:abort',
    `schedule-exit:1:${SHUTDOWN_DEADLINE_MS}`,
  ]);
});

/** TTYとして振る舞い、raw modeの切り替えを記録する標準入力を作成します。 */
const createTtyInput = (): PassThrough & { readonly rawModes: boolean[] } => {
  const rawModes: boolean[] = [];

  return Object.assign(new PassThrough(), {
    isTTY: true,
    rawModes,
    setRawMode(this: PassThrough, mode: boolean) {
      rawModes.push(mode);
      return this;
    },
  });
};

/** 列数を持つ端末として振る舞う偽の標準出力を作成します。 */
const createTerminalStdout = (): FakeStdout & {
    columns: number;
    readonly resize: () => void;
  } => {
    const stdout = createStdout(),
      listeners: (() => void)[] = [];

    return {
      ...stdout,
      columns: 80,
      isTTY: true,
      off: (_event, listener) => {
        listeners.splice(listeners.indexOf(listener), 1);
      },
      on: (event, listener) => {
        if (event === 'resize') {
          listeners.push(listener);
          return stdout;
        }

        return stdout.on(event, listener);
      },
      resize: () => {
        for (const listener of listeners) {
          listener();
        }
      },
    };
  },
  /** 登録されたリスナーを記録し、イベントを発生させられる偽のプロセスを作成します。 */
  createProcessEvents = (): ProcessEvents & {
    readonly emit: (event: string) => void;
    readonly listenerCount: () => number;
  } => {
    const emitter = new EventEmitter();

    return {
      emit: (event) => {
        emitter.emit(event);
      },
      listenerCount: () =>
        emitter.eventNames().reduce((count, event) => count + emitter.listenerCount(event), 0),
      off: (event, listener) => emitter.off(event, listener),
      on: (event, listener) => emitter.on(event, listener),
    };
  };

type InteractiveRun = {
  readonly events: readonly string[];
  readonly exitCode: number;
  readonly output: string;
  readonly processEvents: ReturnType<typeof createProcessEvents>;
  readonly stdin: ReturnType<typeof createTtyInput>;
};

/** 端末として振る舞う標準入出力で、指定した回の待機の直前にキーを押しながら実行します。 */
const runInteractive = async (
  arguments_: readonly string[],
  keysBySleep: ReadonlyMap<number, string> = new Map(),
  overrides: Partial<RunCliParameters> = {},
): Promise<InteractiveRun> => {
  const stdin = createTtyInput(),
    stdout = createTerminalStdout(),
    processEvents = createProcessEvents();
  let sleepCount = 0,
    currentTime = 0;
  const harness = createHarness(
      arguments_,
      {
        color: false,
        interactive: true,
        now: () => currentTime,
        processEvents,
        sleep: (durationMs) => {
          const keys = keysBySleep.get(sleepCount);

          sleepCount += 1;

          if (keys !== undefined) {
            stdin.write(keys);
          }

          // キーの復号を待ってから時刻を進めます。
          return new Promise((resolve) => {
            setImmediate(() => {
              currentTime += durationMs;
              resolve();
            });
          });
        },
        stdin,
        ...overrides,
      },
      stdout,
    ),
    exitCode = await runCli(harness.parameters);

  return { events: harness.events, exitCode, output: stdout.output(), processEvents, stdin };
};

describe('残り時間の画面', () => {
  const HIDE_CURSOR = '\u001B[?25l',
    SHOW_CURSOR = '\u001B[?25h';

  test('画面を同じ位置へ描き直し、フェーズの完了だけを行として残す', async () => {
    const { events, exitCode, output, processEvents, stdin } = await runInteractive([
      '--work',
      '1',
      '--break',
      '1',
      '--loop',
      '1',
    ]);

    expect(exitCode).toBe(0);
    expect(
      output.startsWith(
        `${LOGO}\n${HIDE_CURSOR}\u001B[2K  🍅 WORK                      Cycle 1 / 1\n`,
      ),
    ).toBe(true);
    expect(output).toContain('\u001B[2K          ████      ██████ ██████\n');
    expect(output).toContain('\u001B[2K  0:01 elapsed       1%         1:00 total\n');
    expect(output).toContain('\u001B[2K  [space] pause   [s] skip   [q] quit\n');
    expect(output).toContain('✅ Work complete.\n\u001B[2K  ☕ BREAK');
    expect(output).toContain('\u001B[15A\u001B[2K  🍅 WORK');
    expect(output).not.toContain('\u001B[31m');
    expect(output).not.toContain('started');
    expect(output.endsWith(`✅ Break complete.\n${SHOW_CURSOR}🎉 Pomodoro complete.\n`)).toBe(true);
    expect(stdin.rawModes).toEqual([true, false]);
    expect(processEvents.listenerCount()).toBe(0);
    expect(events).toEqual([
      'create-sound-player',
      'confirm',
      'play:work',
      'play:break:completion-notice',
      'set-exit-code:0',
      'shutdown:complete',
      `schedule-exit:0:${COMPLETION_SHUTDOWN_DEADLINE_MS}`,
    ]);
  });

  test('色が有効な場合は作業を赤、休憩を緑で表示する', async () => {
    const { output } = await runInteractive(
      ['--work', '1', '--break', '1', '--loop', '1'],
      new Map(),
      { color: true },
    );

    expect(output).toContain('\u001B[31m🍅 WORK\u001B[39m');
    expect(output).toContain('\u001B[32m☕ BREAK\u001B[39m');
  });

  test('spaceで一時停止を表示し、もう一度押すと再開して完了する', async () => {
    const { output } = await runInteractive(
      ['--work', '1', '--break', '1', '--loop', '1'],
      new Map([
        [4, ' '],
        [44, ' '],
      ]),
    );

    expect(output).toContain('\u001B[2K  🍅 WORK PAUSED               Cycle 1 / 1\n');
    expect(output).toContain('\u001B[2K  [space] resume   [s] skip   [q] quit\n');
    expect(output).toContain('\u001B[2K  0:01 elapsed       1%         1:00 total\n');
    expect(output).toContain('✅ Work complete.');
  });

  test('sでフェーズをskipし、音を鳴らさずにskipした行を残す', async () => {
    const { events, exitCode, output } = await runInteractive(
      ['--work', '1', '--break', '1', '--loop', '1'],
      new Map([
        [1, 's'],
        [3, 'S'],
      ]),
    );

    expect(exitCode).toBe(0);
    expect(output).toContain('⏩ Work skipped.\n');
    expect(output).toContain('⏩ Break skipped.\n');
    expect(output).not.toContain('complete.\n\u001B');
    expect(events).toEqual([
      'create-sound-player',
      'confirm',
      'set-exit-code:0',
      'shutdown:complete',
      `schedule-exit:0:${COMPLETION_SHUTDOWN_DEADLINE_MS}`,
    ]);
  });

  test.each([
    { exitCode: INTERRUPTED_EXIT_CODE, key: '\u0003', name: 'Ctrl+C' },
    { exitCode: 0, key: 'q', name: 'q' },
  ])(
    '$nameでタイマーを止め、端末を元に戻して終了コード$exitCodeで終了する',
    async ({ exitCode, key }) => {
      const result = await runInteractive([], new Map([[1, key]]));

      expect(result.exitCode).toBe(exitCode);
      expect(result.output.endsWith(SHOW_CURSOR)).toBe(true);
      expect(result.stdin.rawModes).toEqual([true, false]);
      expect(result.processEvents.listenerCount()).toBe(0);
      expect(result.events).toEqual([
        'create-sound-player',
        'confirm',
        `set-exit-code:${exitCode}`,
        'shutdown:abort',
        `schedule-exit:${exitCode}:${SHUTDOWN_DEADLINE_MS}`,
      ]);
    },
  );

  test('期限到達済みの最後の休憩でqを押すと、終了より完了を優先する', async () => {
    let currentTime = 0;
    const stdin = createTtyInput(),
      harness = createHarness(
        ['--work', '1', '--break', '1', '--loop', '1'],
        {
          color: false,
          interactive: true,
          now: () => currentTime,
          processEvents: createProcessEvents(),
          sleep: () => {
            // 1回目の待機で作業の期限を過ぎ、2回目の待機で休憩の期限を過ぎてからqを押す
            currentTime += MINUTE_MS;

            if (currentTime > MINUTE_MS) {
              stdin.emit('keypress', 'q', { name: 'q' });
            }

            return Promise.resolve();
          },
          stdin,
        },
        createTerminalStdout(),
      ),
      exitCode = await runCli(harness.parameters);

    expect(exitCode).toBe(0);
    expect(harness.events).toEqual([
      'create-sound-player',
      'confirm',
      'play:work',
      'play:break:completion-notice',
      'set-exit-code:0',
      'shutdown:complete',
      `schedule-exit:0:${COMPLETION_SHUTDOWN_DEADLINE_MS}`,
    ]);
  });

  test.each([
    { exitCode: 129, signal: 'SIGHUP' },
    { exitCode: 130, signal: 'SIGINT' },
    { exitCode: 143, signal: 'SIGTERM' },
  ])(
    '$signalを受け取ると端末を元に戻して終了コード$exitCodeで終了する',
    async ({ exitCode, signal }) => {
      const processEvents = createProcessEvents(),
        harness = createHarness(
          [],
          {
            color: false,
            interactive: true,
            processEvents,
            sleep: () => {
              processEvents.emit(signal);
              return Promise.resolve();
            },
            stdin: createTtyInput(),
          },
          createTerminalStdout(),
        ),
        result = await runCli(harness.parameters);

      expect(result).toBe(exitCode);
      expect(processEvents.listenerCount()).toBe(0);
      expect(harness.events).toContain(`set-exit-code:${exitCode}`);
    },
  );

  test('終了処理を経ずにプロセスが終了するときはカーソルを同期的に戻す', async () => {
    const processEvents = createProcessEvents(),
      stdout = Object.assign(createTerminalStdout(), { fd: -1 }),
      harness = createHarness(
        [],
        {
          color: false,
          interactive: true,
          processEvents,
          sleep: () => {
            // 書き込めないfdでも例外にせず、exitの保険を実行できる
            processEvents.emit('exit');
            return Promise.reject(new Error('stop'));
          },
          stdin: createTtyInput(),
        },
        stdout,
      );

    await expect(runCli(harness.parameters)).rejects.toThrow('stop');
    expect(processEvents.listenerCount()).toBe(0);
  });

  test('端末幅が変わると旧画面を消さずに新しい幅の画面を追記する', async () => {
    const stdout = createTerminalStdout();
    let resized = false;
    const harness = createHarness(
      [],
      {
        color: false,
        interactive: true,
        processEvents: createProcessEvents(),
        sleep: () => {
          if (!resized) {
            resized = true;
            stdout.columns = 30;
            stdout.resize();
          }

          return Promise.reject(new Error('stop'));
        },
        stdin: createTtyInput(),
      },
      stdout,
    );

    await expect(runCli(harness.parameters)).rejects.toThrow('stop');
    expect(stdout.output()).toContain(
      '[q] quit\n\u001B[2K🍅 WORK  1/3\n\u001B[2K15:00 left · 0%\n',
    );
  });

  test('ロゴが収まらない幅の端末では短い見出しを表示する', async () => {
    const stdout = Object.assign(createTerminalStdout(), { columns: 40 }),
      harness = createHarness(
        [],
        { confirmStart: () => Promise.resolve(false), interactive: true },
        stdout,
      );

    await runCli(harness.parameters);

    expect(stdout.output()).toBe('\n  🍅 pomotty\n\n⏹️ Work was not started.\n');
  });

  test('標準出力が端末でない場合はフェーズの開始と完了を1行ずつ出力する', async () => {
    const result = await runCliFor(['--work', '1', '--break', '1', '--loop', '1'], {
      stdin: createTtyInput(),
    });

    expect(result.output).toBe(
      `${LOGO}\n🍅 Work started (1 min)\n✅ Work complete.\n☕ Break started (1 min)\n✅ Break complete.\n🎉 Pomodoro complete.\n`,
    );
  });
});

describe('起動と終了の詳細', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  test('指定した時間をフェーズの開始メッセージに表示する', async () => {
    const result = await runCliFor(['--work=2', '--break=1', '--loop=1']);

    expect(result.output).toBe(
      `${LOGO}\n🍅 Work started (2 min)\n✅ Work complete.\n☕ Break started (1 min)\n✅ Break complete.\n🎉 Pomodoro complete.\n`,
    );
  });

  test('ヘルプは不正な引数より優先する', async () => {
    const result = await runCliFor(['--work', '0', '--unknown', '-h']);

    expect(result).toEqual({
      elapsedMs: 0,
      errorOutput: '',
      events: [],
      exitCode: 0,
      output: help,
    });
  });

  test.each([
    { error: brokenPipe(), exitCode: 0, name: 'EPIPE' },
    { error: new Error('write EIO'), exitCode: 1, name: 'その他のエラー' },
  ])(
    'ロゴの書き込みが同期的に$nameで失敗した場合は開始確認を表示せず終了コード$exitCodeで終える',
    async ({ error, exitCode }) => {
      const stdout = createStdout(() => {
          throw error;
        }),
        harness = createHarness([], {}, stdout);

      expect(await runCli(harness.parameters)).toBe(exitCode);
      expect(harness.events).toEqual([
        'create-sound-player',
        `set-exit-code:${exitCode}`,
        'shutdown:abort',
        `schedule-exit:${exitCode}:${SHUTDOWN_DEADLINE_MS}`,
      ]);
    },
  );

  test('開始確認の後に終了処理が始まっていた場合は、確認結果にかかわらずタイマーを開始しない', async () => {
    const stdout = createStdout(),
      harness = createHarness(
        [],
        {
          confirmStart: () => {
            stdout.emitError(new Error('write EIO'));
            return Promise.resolve(true);
          },
        },
        stdout,
      );

    expect(await runCli(harness.parameters)).toBe(1);
    expect(harness.clock()).toBe(0);
    expect(harness.events).toEqual([
      'create-sound-player',
      'set-exit-code:1',
      'shutdown:abort',
      `schedule-exit:1:${SHUTDOWN_DEADLINE_MS}`,
    ]);
  });

  test('再生処理の作成に失敗した場合は何も出力せず、終了処理を開始して例外を伝える', async () => {
    const failure = new Error('cannot resolve commands'),
      harness = createHarness([], {
        createSoundPlayer: () => {
          throw failure;
        },
      });

    await expect(runCli(harness.parameters)).rejects.toBe(failure);
    expect(harness.stdout.output()).toBe('');
    expect(harness.events).toEqual(['set-exit-code:1', `schedule-exit:1:${SHUTDOWN_DEADLINE_MS}`]);
  });

  test('タイマー実行中の例外では再生処理を終了してから例外を伝える', async () => {
    const failure = new Error('timer failed'),
      harness = createHarness([], { sleep: () => Promise.reject(failure) });

    await expect(runCli(harness.parameters)).rejects.toBe(failure);
    expect(harness.events).toEqual([
      'create-sound-player',
      'confirm',
      'set-exit-code:1',
      'shutdown:abort',
      `schedule-exit:1:${SHUTDOWN_DEADLINE_MS}`,
    ]);
  });

  test('作業の完了音は最後の休憩以外で完了通知として扱わない', async () => {
    const result = await runCliFor(['--loop', '2']);

    expect(result.events.filter((event) => event.startsWith('play:'))).toEqual([
      'play:work',
      'play:break',
      'play:work',
      'play:break:completion-notice',
    ]);
  });

  test('既定では終了処理の期限に達するとprocess.exitで親プロセスを終了する', async () => {
    vi.useFakeTimers();

    const exit = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never),
      harness = createHarness([], { confirmStart: () => Promise.resolve(false) });

    expect(await runCli({ ...harness.parameters, scheduleExit: undefined })).toBe(0);

    vi.advanceTimersByTime(SHUTDOWN_DEADLINE_MS - 1);
    expect(exit).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(exit).toHaveBeenCalledWith(0);
  });

  test('既定では完了終了の期限に達するとprocess.exitで親プロセスを終了する', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout'] });

    const exit = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never),
      harness = createHarness(['--work', '1', '--break', '1', '--loop', '1']);

    expect(await runCli({ ...harness.parameters, scheduleExit: undefined })).toBe(0);

    vi.advanceTimersByTime(COMPLETION_SHUTDOWN_DEADLINE_MS - 1);
    expect(exit).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(exit).toHaveBeenCalledWith(0);
  });

  test('既定の強制終了のtimerはイベントループを維持しない', async () => {
    const unref = vi.fn<() => void>(),
      setTimeoutSpy = vi
        .spyOn(globalThis, 'setTimeout')
        .mockImplementation(() => ({ unref }) as unknown as NodeJS.Timeout),
      harness = createHarness([], { confirmStart: () => Promise.resolve(false) });

    await runCli({ ...harness.parameters, scheduleExit: undefined });

    expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), SHUTDOWN_DEADLINE_MS);
    expect(unref).toHaveBeenCalledTimes(1);
  });

  test('既定では終了コードをprocess.exitCodeへ設定する', async () => {
    const originalExitCode = process.exitCode,
      harness = createHarness([], { confirmStart: () => Promise.resolve(false) });

    try {
      process.exitCode = 99;
      await runCli({ ...harness.parameters, setExitCode: undefined });

      expect(process.exitCode).toBe(0);
    } finally {
      process.exitCode = originalExitCode;
    }
  });
});

describe('終了要求の重複', () => {
  test('最初の終了要求の終了コードを保ち、終了処理を1回だけ行う', async () => {
    const processEvents = createProcessEvents(),
      harness = createHarness(
        [],
        {
          color: false,
          interactive: true,
          processEvents,
          sleep: () => {
            processEvents.emit('SIGTERM');
            processEvents.emit('SIGINT');
            return Promise.resolve();
          },
          stdin: createTtyInput(),
        },
        createTerminalStdout(),
      );

    expect(await runCli(harness.parameters)).toBe(143);
    expect(harness.events).toEqual([
      'create-sound-player',
      'confirm',
      'set-exit-code:143',
      'shutdown:abort',
      `schedule-exit:143:${SHUTDOWN_DEADLINE_MS}`,
    ]);
  });

  test('終了要求の後に標準出力が失敗しても終了コードを変えない', async () => {
    const stdout = createTerminalStdout(),
      processEvents = createProcessEvents(),
      harness = createHarness(
        [],
        {
          color: false,
          interactive: true,
          processEvents,
          sleep: () => {
            processEvents.emit('SIGHUP');
            stdout.emitError(new Error('write EIO'));
            return Promise.resolve();
          },
          stdin: createTtyInput(),
        },
        stdout,
      );

    expect(await runCli(harness.parameters)).toBe(129);
    expect(harness.events.filter((event) => event.startsWith('set-exit-code'))).toEqual([
      'set-exit-code:129',
    ]);
  });
});
