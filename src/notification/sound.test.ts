import { FORCE_KILL_DELAY_MS, PLAYER_TIMEOUT_MS, createOperationTracker } from './operation.ts';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import type { PlayerCommands } from '#src/platform/commands.ts';
import type { SoundPlayer } from './sound.ts';
import type { FakeSpawner } from './fake-child.test-helper.ts';
import { createFakeSpawner } from './fake-child.test-helper.ts';
import { createSoundPlayer } from './sound.ts';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import process from 'node:process';

const APLAY = '/usr/bin/aplay',
  PAPLAY = '/usr/bin/paplay',
  POWERSHELL = String.raw`C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe`,
  RIFF_END_INDEX = 4,
  RIFF_START_INDEX = 0,
  SOUND_DIRECTORY = new URL('../../assets/', import.meta.url),
  WORK_SOUND = fileURLToPath(new URL('work-end.wav', SOUND_DIRECTORY)),
  BREAK_SOUND = fileURLToPath(new URL('break-end.wav', SOUND_DIRECTORY)),
  LINUX_COMMANDS: PlayerCommands = { aplay: APLAY, paplay: PAPLAY },
  /** 偽の子プロセスで再生処理を作成します。 */
  createPlayer = (
    commands: PlayerCommands,
    failures?: ReadonlySet<string>,
  ): { bells: string[]; player: SoundPlayer; spawner: FakeSpawner } => {
    const spawner = createFakeSpawner(failures),
      bells: string[] = [],
      player = createSoundPlayer({
        commands,
        environment: { PATH: '/usr/bin', SystemRoot: String.raw`C:\Windows` },
        soundDirectory: SOUND_DIRECTORY,
        spawnChild: spawner.spawnChild,
        writeFallback: (output) => {
          bells.push(output);
        },
      });

    return { bells, player, spawner };
  },
  /** 子プロセスのイベントを反映させるため、保留中のPromiseを処理します。 */
  flush = async (): Promise<void> => {
    await vi.advanceTimersByTimeAsync(0);
  };

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

test('作業完了と休憩完了で異なる音源を、解決済みの絶対パスで再生する', () => {
  const { spawner, player } = createPlayer({ afplay: '/usr/bin/afplay' });

  player.play('work');
  player.play('break');

  expect(
    spawner.children.map(({ commandArguments, commandPath }) => [commandPath, commandArguments]),
  ).toEqual([
    ['/usr/bin/afplay', [WORK_SOUND]],
    ['/usr/bin/afplay', [BREAK_SOUND]],
  ]);
});

test('同梱する2つの通知音は異なるPCM WAVEデータである', async () => {
  vi.useRealTimers();

  const [workSound, breakSound] = await Promise.all([readFile(WORK_SOUND), readFile(BREAK_SOUND)]);

  expect(workSound.subarray(RIFF_START_INDEX, RIFF_END_INDEX).toString('ascii')).toBe('RIFF');
  expect(breakSound.subarray(RIFF_START_INDEX, RIFF_END_INDEX).toString('ascii')).toBe('RIFF');
  expect(workSound.equals(breakSound)).toBe(false);
});

test('再生コマンドがない環境でも異なるベルで通知する', async () => {
  const { bells, player } = createPlayer({});

  player.play('work');
  player.play('break');
  await flush();

  expect(bells).toEqual(['\u0007', '\u0007\u0007']);
});

test('Linuxではpaplayが失敗したらaplayを試し、aplayが成功すればベルを鳴らさない', async () => {
  const { bells, player, spawner } = createPlayer(LINUX_COMMANDS);

  player.play('work');
  spawner.children[0]?.emitClose(1);
  await flush();

  expect(spawner.children.map(({ commandPath }) => commandPath)).toEqual([PAPLAY, APLAY]);

  spawner.children[1]?.emitClose(0);
  await flush();

  expect(bells).toEqual([]);
});

test('Linuxではpaplayが成功したらaplayを試さない', async () => {
  const { bells, player, spawner } = createPlayer(LINUX_COMMANDS);

  player.play('break');
  spawner.children[0]?.emitClose(0);
  await flush();

  expect(spawner.children).toHaveLength(1);
  expect(bells).toEqual([]);
});

test('Linuxでpaplayとaplayの両方が失敗した場合だけベルを鳴らす', async () => {
  const { bells, player, spawner } = createPlayer(LINUX_COMMANDS);

  player.play('break');
  spawner.children[0]?.emitClose(null, 'SIGTERM');
  await flush();
  spawner.children[1]?.emitClose(1);
  await flush();

  expect(bells).toEqual(['\u0007\u0007']);
});

test('errorとcloseの両方が発生しても次の候補とベルは1回だけ実行する', async () => {
  const { bells, player, spawner } = createPlayer(LINUX_COMMANDS);

  player.play('work');
  spawner.children[0]?.emitError();
  spawner.children[0]?.emitClose(-2);
  await flush();
  spawner.children[1]?.emitError();
  spawner.children[1]?.emitClose(-2);
  await flush();

  expect(spawner.children.map(({ commandPath }) => commandPath)).toEqual([PAPLAY, APLAY]);
  expect(bells).toEqual(['\u0007']);
});

test('起動時の同期例外は失敗として次の候補へ進む', async () => {
  const { bells, player, spawner } = createPlayer(LINUX_COMMANDS, new Set([PAPLAY]));

  player.play('work');
  await flush();

  expect(spawner.children.map(({ commandPath }) => commandPath)).toEqual([APLAY]);

  spawner.children[0]?.emitClose(0);
  await flush();

  expect(bells).toEqual([]);
});

test('全候補の起動が同期例外で失敗した場合はベルを鳴らす', async () => {
  const { bells, player } = createPlayer(LINUX_COMMANDS, new Set([PAPLAY, APLAY]));

  player.play('break');
  await flush();

  expect(bells).toEqual(['\u0007\u0007']);
});

test('Windowsでは音源パスをスクリプトへ補間せず環境変数で渡す', () => {
  const { player, spawner } = createPlayer({ powershell: POWERSHELL });

  player.play('break');

  const [child] = spawner.children;

  expect(child?.commandPath).toBe(POWERSHELL);
  expect(child?.commandArguments.slice(0, 3)).toEqual([
    '-NoProfile',
    '-NonInteractive',
    '-Command',
  ]);
  expect(child?.commandArguments.join(' ')).not.toContain(BREAK_SOUND);
  expect(child?.commandArguments.at(-1)).toContain('$env:POMOTTY_SOUND_FILE');
  expect(child?.env).toEqual({
    PATH: '/usr/bin',
    POMOTTY_SOUND_FILE: BREAK_SOUND,
    SystemRoot: String.raw`C:\Windows`,
  });
});

test('再生が10秒で終わらなければ打ち切り、次の候補へ進んで1秒後に強制終了を要求する', async () => {
  const { bells, player, spawner } = createPlayer(LINUX_COMMANDS);

  player.play('work');
  await vi.advanceTimersByTimeAsync(PLAYER_TIMEOUT_MS - 1);

  expect(spawner.children[0]?.signals).toEqual([]);

  await vi.advanceTimersByTimeAsync(1);

  expect(spawner.children[0]?.signals).toEqual(['SIGTERM']);
  expect(spawner.children.map(({ commandPath }) => commandPath)).toEqual([PAPLAY, APLAY]);

  await vi.advanceTimersByTimeAsync(FORCE_KILL_DELAY_MS);

  expect(spawner.children[0]?.signals).toEqual(['SIGTERM', 'SIGKILL']);

  spawner.children[1]?.emitClose(0);
  await flush();

  expect(bells).toEqual([]);
});

test('打ち切り後1秒以内に終了した子プロセスへは強制終了を要求しない', async () => {
  const { player, spawner } = createPlayer({ afplay: '/usr/bin/afplay' });

  player.play('work');
  await vi.advanceTimersByTimeAsync(PLAYER_TIMEOUT_MS);
  spawner.children[0]?.emitClose(null, 'SIGTERM');
  await vi.advanceTimersByTimeAsync(FORCE_KILL_DELAY_MS);

  expect(spawner.children[0]?.signals).toEqual(['SIGTERM']);
});

test('前の再生が終わる前の再生要求は前の再生を止めずに並行させる', () => {
  const { player, spawner } = createPlayer({ afplay: '/usr/bin/afplay' });

  player.play('work');
  player.play('break');

  expect(spawner.children).toHaveLength(2);
  expect(spawner.children.flatMap(({ signals }) => signals)).toEqual([]);
});

test('すべての再生コマンドがある場合はafplay、paplay、aplay、PowerShellの順に試す', async () => {
  const { bells, player, spawner } = createPlayer({
    afplay: '/usr/bin/afplay',
    aplay: APLAY,
    paplay: PAPLAY,
    powershell: POWERSHELL,
  });

  player.play('work');

  for (let index = 0; index < 4; index += 1) {
    spawner.children[index]?.emitClose(1);
    // oxlint-disable-next-line no-await-in-loop
    await flush();
  }

  expect(spawner.children.map(({ commandPath }) => commandPath)).toEqual([
    '/usr/bin/afplay',
    PAPLAY,
    APLAY,
    POWERSHELL,
  ]);
  expect(spawner.children.slice(0, 3).map(({ commandArguments }) => commandArguments)).toEqual([
    [WORK_SOUND],
    [WORK_SOUND],
    [WORK_SOUND],
  ]);
  expect(bells).toEqual(['\u0007']);
});

test('PowerShell以外の再生コマンドには環境変数を指定しない', () => {
  const { player, spawner } = createPlayer({ afplay: '/usr/bin/afplay' });

  player.play('work');

  expect(spawner.children[0]?.env).toBeUndefined();
});

test('終了処理の後の再生要求では子プロセスもベルも開始しない', async () => {
  const { bells, player, spawner } = createPlayer(LINUX_COMMANDS);

  await player.shutdown({ complete: false });
  player.play('work');
  await flush();

  expect(spawner.children).toEqual([]);
  expect(bells).toEqual([]);
});

test('再生中に終了処理が始まると次の候補もベルも実行しない', async () => {
  const { bells, player, spawner } = createPlayer(LINUX_COMMANDS);

  player.play('work');
  await player.shutdown({ complete: false });
  spawner.children[0]?.emitClose(null, 'SIGTERM');
  await flush();

  expect(spawner.children).toHaveLength(1);
  expect(bells).toEqual([]);
});

test('完了終了中も完了通知の再生は次の候補とベルまで続ける', async () => {
  const { bells, player, spawner } = createPlayer(LINUX_COMMANDS);

  player.play('break', { completionNotice: true });
  void player.shutdown({ complete: true });
  spawner.children[0]?.emitClose(1);
  await flush();
  spawner.children[1]?.emitClose(1);
  await flush();

  expect(spawner.children.map(({ commandPath }) => commandPath)).toEqual([PAPLAY, APLAY]);
  expect(bells).toEqual(['\u0007\u0007']);
});

test('完了終了では完了通知でない再生を打ち切り、ベルを鳴らさない', async () => {
  const { bells, player, spawner } = createPlayer(LINUX_COMMANDS);

  player.play('work');
  await player.shutdown({ complete: true });
  spawner.children[0]?.emitClose(1);
  await flush();

  expect(spawner.children).toHaveLength(1);
  expect(spawner.children[0]?.signals).toEqual(['SIGTERM']);
  expect(bells).toEqual([]);
});

test('追跡処理を指定した場合はその追跡処理で子プロセスを起動し、終了処理を委ねる', async () => {
  const spawner = createFakeSpawner(),
    tracker = createOperationTracker(spawner.spawnChild),
    shutdown = vi.spyOn(tracker, 'shutdown'),
    unused = createFakeSpawner(),
    player = createSoundPlayer({
      commands: { afplay: '/usr/bin/afplay' },
      soundDirectory: SOUND_DIRECTORY,
      spawnChild: unused.spawnChild,
      tracker,
      writeFallback: vi.fn<() => void>(),
    });

  player.play('work');
  await player.shutdown({ complete: true });

  expect(spawner.children).toHaveLength(1);
  expect(unused.children).toEqual([]);
  expect(shutdown).toHaveBeenCalledWith({ complete: true });
});

test('環境変数を省略した場合はプロセスの環境変数をPowerShellへ引き継ぐ', () => {
  const spawner = createFakeSpawner(),
    player = createSoundPlayer({
      commands: { powershell: POWERSHELL },
      soundDirectory: SOUND_DIRECTORY,
      spawnChild: spawner.spawnChild,
      writeFallback: vi.fn<() => void>(),
    });

  player.play('work');

  expect(spawner.children[0]?.env).toEqual({ ...process.env, POMOTTY_SOUND_FILE: WORK_SOUND });
});

test('ベルの書き込み処理を省略した場合は標準エラー出力へ書き込む', async () => {
  const write = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

  try {
    const player = createSoundPlayer({ commands: {}, soundDirectory: SOUND_DIRECTORY });

    player.play('break');
    await flush();

    expect(write).toHaveBeenCalledWith('\u0007\u0007');
  } finally {
    write.mockRestore();
  }
});

test('completionNoticeを省略した再生要求は完了通知として扱わない', async () => {
  const { bells, player, spawner } = createPlayer(LINUX_COMMANDS);

  player.play('break', {});
  await player.shutdown({ complete: true });

  expect(spawner.children[0]?.signals).toEqual(['SIGTERM']);
  expect(bells).toEqual([]);
});
