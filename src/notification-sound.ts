import type { TimerPhase } from '@/timer.ts';
import { fileURLToPath } from 'node:url';
import process from 'node:process';
import { spawn } from 'node:child_process';

type SoundProcess = {
  readonly onClose: (listener: (code: number | null) => void) => void;
  readonly onError: (listener: () => void) => void;
};

type SoundProcessOptions = {
  readonly env?: NodeJS.ProcessEnv;
  readonly stdio: 'ignore';
  readonly windowsHide: true;
};

type SpawnSoundProcess = (
  command: string,
  commandArguments: readonly string[],
  options: SoundProcessOptions,
) => SoundProcess;

type SoundCommand = {
  readonly command: string;
  readonly commandArguments: readonly string[];
  readonly env?: NodeJS.ProcessEnv;
};

type PlayCompletionSoundParameters = {
  readonly platform?: NodeJS.Platform;
  readonly spawnProcess?: SpawnSoundProcess;
  readonly writeFallback?: (output: string) => void;
};

type RunSoundCommandsParameters = {
  readonly commands: readonly SoundCommand[];
  readonly fallback: () => void;
  readonly index: number;
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
  soundFileFor = (phase: TimerPhase): string =>
    fileURLToPath(new URL(`../assets/${phase}-end.wav`, import.meta.url)),
  soundEnvironmentFor = (soundFile: string): NodeJS.ProcessEnv => {
    const environment = structuredClone(process.env);

    environment.POMOTTY_SOUND_FILE = soundFile;
    return environment;
  },
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
