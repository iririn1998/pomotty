import type { TimerPhase } from '@/timer/timer.ts';
import { fileURLToPath } from 'node:url';
import process from 'node:process';
import { spawn } from 'node:child_process';

/** 音声再生プロセスから監視するイベントを定義します。 */
type SoundProcess = {
  /** プロセス終了時の処理を登録します。 */
  readonly onClose: (listener: (code: number | null) => void) => void;

  /** プロセスエラー時の処理を登録します。 */
  readonly onError: (listener: () => void) => void;
};

/** 音声再生プロセスへ渡す固定オプションです。 */
type SoundProcessOptions = {
  /** 子プロセスへ渡す環境変数です。 */
  readonly env?: NodeJS.ProcessEnv;

  /** 標準入出力を使用しない指定です。 */
  readonly stdio: 'ignore';

  /** Windowsで子プロセスのウィンドウを隠す指定です。 */
  readonly windowsHide: true;
};

/** 音声再生プロセスを起動する処理です。 */
type SpawnSoundProcess = (
  command: string,
  commandArguments: readonly string[],
  options: SoundProcessOptions,
) => SoundProcess;

/** 実行する音声コマンドと引数です。 */
type SoundCommand = {
  /** 実行するコマンドです。 */
  readonly command: string;

  /** コマンドへ渡す引数です。 */
  readonly commandArguments: readonly string[];

  /** コマンド固有の環境変数です。 */
  readonly env?: NodeJS.ProcessEnv;
};

/** 完了音の再生時に差し替えられる処理を定義します。 */
type PlayCompletionSoundParameters = {
  /** 再生方法の判定に使うOSです。 */
  readonly platform?: NodeJS.Platform;

  /** 音声再生プロセスを起動する処理です。 */
  readonly spawnProcess?: SpawnSoundProcess;

  /** 再生できない場合にベルを書き込む処理です。 */
  readonly writeFallback?: (output: string) => void;
};

/** 音声コマンドを順番に試すための値です。 */
type RunSoundCommandsParameters = {
  /** 実行候補のコマンド一覧です。 */
  readonly commands: readonly SoundCommand[];

  /** 全候補が失敗した場合の処理です。 */
  readonly fallback: () => void;

  /** 次に実行する候補の位置です。 */
  readonly index: number;

  /** 音声再生プロセスを起動する処理です。 */
  readonly spawnProcess: SpawnSoundProcess;
};

const FIRST_COMMAND_INDEX = 0,
  NEXT_COMMAND_OFFSET = 1,
  SUCCESS_EXIT_CODE = 0,
  FALLBACK_SOUNDS = { break: '\u0007\u0007', work: '\u0007' } as const,
  WINDOWS_SOUND_SCRIPT = [
    '$player = New-Object System.Media.SoundPlayer',
    '$player.SoundLocation = $env:POMOTTY_SOUND_FILE',
    '$player.PlaySync()',
  ].join('; '),
  /** Node.jsの子プロセスを監視用インターフェースで包みます。 */
  spawnSoundProcess: SpawnSoundProcess = (command, commandArguments, options) => {
    const child = spawn(command, [...commandArguments], options);

    return {
      onClose: (listener) => {
        child.once('close', listener);
      },
      onError: (listener) => {
        child.once('error', listener);
      },
    };
  },
  /** フェーズに対応する同梱音源のパスを返します。 */
  soundFileFor = (phase: TimerPhase): string =>
    fileURLToPath(new URL(`../../assets/${phase}-end.wav`, import.meta.url)),
  /** Windowsの再生処理へ音源パスを渡す環境変数を作成します。 */
  soundEnvironmentFor = (soundFile: string): NodeJS.ProcessEnv => {
    const environment = structuredClone(process.env);

    environment.POMOTTY_SOUND_FILE = soundFile;
    return environment;
  },
  /** OSに応じた音声コマンドの候補を返します。 */
  commandsFor = (platform: NodeJS.Platform, soundFile: string): readonly SoundCommand[] => {
    switch (platform) {
      case 'darwin': {
        return [{ command: '/usr/bin/afplay', commandArguments: [soundFile] }];
      }
      case 'linux': {
        return [
          { command: 'paplay', commandArguments: [soundFile] },
          { command: 'aplay', commandArguments: [soundFile] },
        ];
      }
      case 'win32': {
        return [
          {
            command: 'powershell.exe',
            commandArguments: ['-NoProfile', '-NonInteractive', '-Command', WINDOWS_SOUND_SCRIPT],
            env: soundEnvironmentFor(soundFile),
          },
        ];
      }
      default: {
        return [];
      }
    }
  },
  /** プロセスの失敗を一度だけ通知します。 */
  observeFailure = (child: SoundProcess, onFailure: () => void): void => {
    let settled = false;
    const failOnce = (): void => {
      if (settled) {
        return;
      }

      settled = true;
      onFailure();
    };

    child.onError(failOnce);
    child.onClose((code) => {
      if (code !== SUCCESS_EXIT_CODE) {
        failOnce();
      }
    });
  },
  /** 音声コマンドを成功するまで順番に試します。 */
  runSoundCommands = ({
    commands,
    fallback,
    index,
    spawnProcess,
  }: RunSoundCommandsParameters): void => {
    const soundCommand = commands.at(index),
      tryNextCommand = (): void => {
        runSoundCommands({
          commands,
          fallback,
          index: index + NEXT_COMMAND_OFFSET,
          spawnProcess,
        });
      };

    if (!soundCommand) {
      fallback();
      return;
    }

    try {
      const child = spawnProcess(soundCommand.command, soundCommand.commandArguments, {
        env: soundCommand.env,
        stdio: 'ignore',
        windowsHide: true,
      });
      observeFailure(child, tryNextCommand);
    } catch {
      tryNextCommand();
    }
  },
  /**
   * フェーズに対応する完了音を非同期で再生します。
   *
   * OSの再生コマンドが使えない場合は、作業完了を1回、休憩完了を2回の
   * ターミナルベルで鳴らし分けます。再生完了はタイマー進行を妨げません。
   */
  playCompletionSound = (
    phase: TimerPhase,
    {
      platform = process.platform,
      spawnProcess = spawnSoundProcess,
      writeFallback = (output) => {
        process.stderr.write(output);
      },
    }: PlayCompletionSoundParameters = {},
  ): void => {
    const commands = commandsFor(platform, soundFileFor(phase)),
      fallback = (): void => {
        writeFallback(FALLBACK_SOUNDS[phase]);
      };

    runSoundCommands({
      commands,
      fallback,
      index: FIRST_COMMAND_INDEX,
      spawnProcess,
    });
  };

export { playCompletionSound };
export type { PlayCompletionSoundParameters, SoundProcess, SoundProcessOptions, SpawnSoundProcess };
