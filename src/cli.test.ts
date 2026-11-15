import { afterAll, beforeAll, expect, test } from 'vitest';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawn } from 'node:child_process';
import { VERSION } from '#src/cli/constants.ts';

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

  /** 標準の設定ファイルを探すディレクトリです。省略時は空の一時ディレクトリです。 */
  readonly configHome?: string;
};

let temporaryDirectory = '';

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
    {
      closeStdout = false,
      configHome = path.join(temporaryDirectory, 'empty'),
      input,
    }: CliProcessOptions = {},
  ): Promise<CliProcessResult> =>
    new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [CLI_PATH, ...arguments_], {
          // 実機の再生コマンドを起動しないよう、探索対象のPATHを空にします。
          // 利用者本人の設定ファイルを読まないよう、標準の設定ファイルの場所も差し替えます。
          env: { ...process.env, APPDATA: configHome, PATH: '', XDG_CONFIG_HOME: configHome },
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

beforeAll(async () => {
  temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), 'pomotty-cli-'));
});

afterAll(async () => {
  await rm(temporaryDirectory, { force: true, recursive: true });
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

test('バージョンを表示して終了コード0で終える', async () => {
  const result = await runCliProcess(['--version']);

  expect(result).toEqual({
    exitCode: 0,
    signal: null,
    stderr: '',
    stdout: `${VERSION}\n`,
  });
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

test('標準の場所の設定ファイルを読み、プリセット一覧に反映する', async () => {
  const configHome = path.join(temporaryDirectory, 'home');

  await mkdir(path.join(configHome, 'pomotty'), { recursive: true });
  await writeFile(
    path.join(configHome, 'pomotty', 'config.json'),
    '{"defaultPreset": "focus", "presets": {"focus": {"work": 40}}}',
  );

  const result = await runCliProcess(['--list-presets'], { configHome });

  expect(result.exitCode).toBe(0);
  expect(result.stdout).toContain('* focus    work 40  break 5   loop 3  config\n');
  expect(result.stderr).toBe('');
});

test('--configで指定したファイルが不正なら終了コード1で終える', async () => {
  const configPath = path.join(temporaryDirectory, 'broken.json');

  await writeFile(configPath, '{"wrok": 25}');

  const result = await runCliProcess(['--config', configPath]);

  expect(result.exitCode).toBe(1);
  expect(result.stderr).toMatch(/^Error: Invalid config file ".+": Unknown key "wrok"\.\n$/u);
  expect(result.stdout).toBe('');
});
