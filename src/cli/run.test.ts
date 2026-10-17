import {
  COMPLETION_SHUTDOWN_DEADLINE_MS,
  INTERRUPTED_EXIT_CODE,
  SHUTDOWN_DEADLINE_MS,
  runCli,
} from './run.ts';
import type { ConfirmStartParameters, RunCliParameters } from './run.ts';
import { DEFAULT_BREAK_DURATION_MS, DEFAULT_WORK_DURATION_MS } from '#src/timer/timer.ts';
import { describe, expect, test } from 'vitest';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { LOGO } from '#src/terminal/constants.ts';
import type { OutputStream } from '#src/terminal/output.ts';
import type { SoundPlayer } from '#src/notification/sound.ts';

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

describe('残り時間の画面', () => {
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
  };

  test('画面を同じ位置へ描き直し、フェーズの完了だけを行として残す', async () => {
    const stdin = createTtyInput(),
      stdout = createTerminalStdout(),
      harness = createHarness(
        ['--work', '1', '--break', '1', '--loop', '1'],
        { color: false, interactive: true, stdin },
        stdout,
      ),
      exitCode = await runCli(harness.parameters),
      output = stdout.output();

    expect(exitCode).toBe(0);
    expect(
      output.startsWith(`${LOGO}\n\u001B[2K  🍅 WORK                      Cycle 1 / 1\n`),
    ).toBe(true);
    expect(output).toContain('\u001B[2K          ████      ██████ ██████\n');
    expect(output).toContain('\u001B[2K  0:01 elapsed       1%         1:00 total\n');
    expect(output).toContain('✅ Work complete.\n\u001B[2K  ☕ BREAK');
    expect(output).toContain('\u001B[13A\u001B[2K  🍅 WORK');
    expect(output).not.toContain('\u001B[31m');
    expect(output).not.toContain('started');
    expect(output.endsWith('✅ Break complete.\n🎉 Pomodoro complete.\n')).toBe(true);
    expect(stdin.rawModes).toEqual([true, false]);
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

  test('色が有効な場合は作業を赤、休憩を緑で表示する', async () => {
    const stdout = createTerminalStdout(),
      harness = createHarness(
        ['--work', '1', '--break', '1', '--loop', '1'],
        { color: true, interactive: true, stdin: createTtyInput() },
        stdout,
      );

    await runCli(harness.parameters);

    expect(stdout.output()).toContain('\u001B[31m🍅 WORK\u001B[39m');
    expect(stdout.output()).toContain('\u001B[32m☕ BREAK\u001B[39m');
  });

  test('Ctrl+Cでタイマーを中断し、終了コード130で終了する', async () => {
    const stdin = createTtyInput(),
      harness = createHarness(
        [],
        {
          color: false,
          interactive: true,
          sleep: () => {
            stdin.emit('keypress', '\u0003', { ctrl: true, name: 'c' });
            return Promise.resolve();
          },
          stdin,
        },
        createTerminalStdout(),
      ),
      exitCode = await runCli(harness.parameters);

    expect(exitCode).toBe(INTERRUPTED_EXIT_CODE);
    expect(stdin.rawModes).toEqual([true, false]);
    expect(harness.events).toEqual([
      'create-sound-player',
      'confirm',
      `set-exit-code:${INTERRUPTED_EXIT_CODE}`,
      'shutdown:abort',
      `schedule-exit:${INTERRUPTED_EXIT_CODE}:${SHUTDOWN_DEADLINE_MS}`,
    ]);
  });

  test('端末幅が変わると旧画面を消さずに新しい幅の画面を追記する', async () => {
    const stdout = createTerminalStdout();
    let resized = false;
    const harness = createHarness(
      [],
      {
        color: false,
        interactive: true,
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
      '      work 15:00      break 5:00\n\u001B[2K🍅 WORK  1/3\n\u001B[2K15:00 left · 0%\n',
    );
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
