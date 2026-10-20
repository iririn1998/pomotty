import { afterEach, describe, expect, test, vi } from 'vitest';
import type { RunCliParameters } from './cli/run.ts';
import { fileURLToPath } from 'node:url';
import process from 'node:process';
import { spawn } from 'node:child_process';

type CliProcessResult = {
  readonly exitCode: number | null;
  readonly signal: NodeJS.Signals | null;
  readonly stderr: string;
  readonly stdout: string;
};

type CliProcessOptions = {
  /** 標準入力へ書き込む文字列です。省略時は標準入力を直ちに閉じます。 */
  readonly input?: string;

  /** 子プロセスの起動直後に、stdoutの読み取り側を閉じる場合は`true`です。 */
  readonly closeStdout?: boolean;
};

const CLI_PATH = fileURLToPath(new URL('cli.ts', import.meta.url)),
  PROCESS_TIMEOUT_MS = 10_000,
  /**
   * 実際のNode.jsでCLIを起動し、終了を待ちます。
   *
   * 偽の端末やspawnを使う単体テストでは通らない、実際のstdin、stdout、
   * イベントループの終了を確認します。
   */
  runCliProcess = (
    arguments_: readonly string[],
    { closeStdout = false, input }: CliProcessOptions = {},
  ): Promise<CliProcessResult> =>
    new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [CLI_PATH, ...arguments_], {
          // 実機の再生コマンドを起動しないよう、探索対象のPATHを空にします。
          env: { ...process.env, PATH: '' },
          stdio: 'pipe',
        }),
        timer = setTimeout(() => {
          child.kill('SIGKILL');
          reject(new Error('CLI did not exit'));
        }, PROCESS_TIMEOUT_MS);
      let stderr = '',
        stdout = '';

      child.stderr.setEncoding('utf8');
      child.stderr.on('data', (chunk: string) => {
        stderr += chunk;
      });

      if (closeStdout) {
        child.stdout.destroy();
      } else {
        child.stdout.setEncoding('utf8');
        child.stdout.on('data', (chunk: string) => {
          stdout += chunk;
        });
      }

      child.stdin.on('error', () => {
        // 子プロセスが先に終了した場合のEPIPEは結果に影響しません。
      });
      child.stdin.end(input);
      child.on('error', reject);
      child.on('close', (exitCode, signal) => {
        clearTimeout(timer);
        resolve({ exitCode, signal, stderr, stdout });
      });
    });

test('開始確認中にstdinが閉じると、作業を開始せず終了コード0で終える', async () => {
  const result = await runCliProcess([]);

  expect(result.exitCode).toBe(0);
  expect(result.stdout).toContain('Start working?');
  expect(result.stdout.endsWith('⏹️ Work was not started.\n')).toBe(true);
  expect(result.stderr).toBe('');
});

test('非TTYではstdinのEnterで作業を開始し、stdoutが閉じていれば終了コード0で終える', async () => {
  // 最短1分のタイマーを開始した後、stdoutのEPIPEでタイマーを待たずに終了する。
  const result = await runCliProcess(['--work', '1', '--break', '1', '--loop', '1'], {
    closeStdout: true,
    input: '\n',
  });

  expect(result).toMatchObject({ exitCode: 0, stderr: '' });
});

test('stdoutが閉じていてもヘルプ表示は未処理例外にならず終了コード0で終える', async () => {
  const result = await runCliProcess(['--help'], { closeStdout: true });

  expect(result).toMatchObject({ exitCode: 0, stderr: '' });
});

test('ヘルプを表示して終了コード0で終える', async () => {
  const result = await runCliProcess(['--help']);

  expect(result.exitCode).toBe(0);
  expect(result.stdout.startsWith('Pomotty CLI\n')).toBe(true);
});

test('不正な引数は開始確認を表示せず終了コード2で終える', async () => {
  const result = await runCliProcess(['--work', '0']);

  expect(result).toEqual({
    exitCode: 2,
    signal: null,
    stderr: 'Error: --work requires an integer from 1 to 1440.\n',
    stdout: '',
  });
});

test('-hでもヘルプを表示して終了コード0で終える', async () => {
  const result = await runCliProcess(['-h']);

  expect(result.exitCode).toBe(0);
  expect(result.stdout.startsWith('Pomotty CLI\n')).toBe(true);
  expect(result.stdout).not.toContain('\u001B');
  expect(result.stderr).toBe('');
});

test('未知のオプションは制御文字をエスケープして診断し、終了コード2で終える', async () => {
  const result = await runCliProcess(['--unknown\u001B[31m']);

  expect(result).toEqual({
    exitCode: 2,
    signal: null,
    stderr: `${String.raw`Error: Unknown option: "--unknown\x1B[31m"`}\n`,
    stdout: '',
  });
});

test('非TTYでは下キーとEnterでNGを選ぶと作業を開始せず終了コード0で終える', async () => {
  const result = await runCliProcess([], { input: '\u001B[B\r' });

  expect(result.exitCode).toBe(0);
  expect(result.stdout).toContain('❯ NG');
  expect(result.stdout.endsWith('⏹️ Work was not started.\n')).toBe(true);
  expect(result.stdout).not.toContain('Work started');
  expect(result.stderr).toBe('');
});

test('非TTYでもCtrl+Cの入力で作業を開始せず終了コード0で終える', async () => {
  const result = await runCliProcess([], { input: '\u0003' });

  expect(result.exitCode).toBe(0);
  expect(result.stdout.endsWith('\n⏹️ Work was not started.\n')).toBe(true);
});

test('非TTYではロゴを表示し、OKを選ぶとフェーズの開始を1行で出力する', async () => {
  const child = spawn(process.execPath, [CLI_PATH, '--work', '1', '--break', '1', '--loop', '1'], {
      env: { ...process.env, PATH: '' },
      stdio: 'pipe',
    }),
    closed = new Promise<NodeJS.Signals | number | null>((resolve) => {
      child.on('close', (exitCode, signal) => {
        resolve(signal ?? exitCode);
      });
    });
  let stdout = '';

  child.stdout.setEncoding('utf8');

  const started = new Promise<void>((resolve) => {
    child.stdout.on('data', (chunk: string) => {
      stdout += chunk;

      if (stdout.includes('Work started')) {
        resolve();
      }
    });
  });

  child.stdin.end('\n');
  await started;
  child.kill('SIGKILL');
  await closed;

  expect(stdout).toContain('██████╗');
  expect(stdout).toContain('Start working?');
  expect(stdout).toContain('🍅 Work started (1 min)\n');
  expect(stdout).not.toContain('\u001B[?25l');
});

type RunCli = (parameters: RunCliParameters) => Promise<number>;

/** 依存を差し替えたエントリポイントを読み込み、トップレベルの処理を実行します。 */
const importEntryPoint = async (runCli: RunCli): Promise<void> => {
  vi.resetModules();
  vi.doMock('./cli/run.ts', () => ({ runCli }));
  await import('./cli.ts');
};

describe('エントリポイントの処理', () => {
  const originalExitCode = process.exitCode;

  afterEach(() => {
    process.exitCode = originalExitCode;
    vi.doUnmock('./cli/run.ts');
    vi.doUnmock('./notification/sound.ts');
    vi.doUnmock('./platform/commands.ts');
    vi.restoreAllMocks();
    vi.resetModules();
  });

  test('CLIの終了コードをプロセスの終了コードに設定する', async () => {
    await importEntryPoint(() => Promise.resolve(2));

    expect(process.exitCode).toBe(2);
  });

  test('再生処理は解決した再生コマンドと同梱音源のディレクトリで作成する', async () => {
    const commands = { paplay: '/usr/bin/paplay' },
      player = { play: vi.fn<() => void>(), shutdown: vi.fn<() => Promise<void>>() },
      createSoundPlayer = vi.fn<(parameters: unknown) => typeof player>(() => player),
      resolvePlayerCommands = vi.fn<() => typeof commands>(() => commands);
    let created: unknown;

    vi.doMock('./notification/sound.ts', () => ({ createSoundPlayer }));
    vi.doMock('./platform/commands.ts', () => ({ resolvePlayerCommands }));
    await importEntryPoint((parameters) => {
      created = parameters.createSoundPlayer();
      return Promise.resolve(0);
    });

    expect(created).toBe(player);
    expect(resolvePlayerCommands).toHaveBeenCalledTimes(1);
    expect(createSoundPlayer).toHaveBeenCalledWith({
      commands,
      soundDirectory: new URL('../assets/', new URL('cli.ts', import.meta.url)),
    });
  });

  test('未処理の例外は終了コード1とし、制御文字をエスケープした1行の診断を出力する', async () => {
    const write = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

    await importEntryPoint(() => Promise.reject(new Error('failed\n\u001B[31m')));

    expect(process.exitCode).toBe(1);
    expect(write).toHaveBeenCalledWith(`${String.raw`Error: "Error: failed\x0A\x1B[31m"`}\n`);
  });

  test('文字列へ変換できない例外値でも診断を出力する', async () => {
    const write = vi.spyOn(process.stderr, 'write').mockImplementation(() => true),
      unconvertible = {
        toString: (): string => {
          throw new Error('cannot convert');
        },
      };

    await importEntryPoint(() => Promise.reject(unconvertible));

    expect(process.exitCode).toBe(1);
    expect(write).toHaveBeenCalledWith('Error: "Unable to convert the thrown value to a string"\n');
  });

  test('標準エラー出力が閉じていても例外にせず終了コード1とする', async () => {
    vi.spyOn(process.stderr, 'write').mockImplementation(() => {
      throw new Error('stderr is closed');
    });

    await importEntryPoint(() => Promise.reject(new Error('failed')));

    expect(process.exitCode).toBe(1);
  });
});
