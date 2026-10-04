import type { Operation, OperationTracker, SpawnChild } from './operation.ts';
import type { PlayerCommands } from '#src/platform/commands.ts';
import type { TimerPhase } from '#src/timer/timer.ts';
import { createDiagnosticWriter } from '#src/diagnostics/writer.ts';
import { createOperationTracker } from './operation.ts';
import { fileURLToPath } from 'node:url';
import process from 'node:process';

/** 実行する音声コマンドと引数です。 */
type SoundCommand = {
  /** 起動時に解決済みのコマンドの絶対パスです。 */
  readonly commandPath: string;

  /** コマンドへ渡す引数です。 */
  readonly commandArguments: readonly string[];

  /** コマンド固有の環境変数です。 */
  readonly env?: NodeJS.ProcessEnv;
};

/** 完了音の再生要求に付ける情報です。 */
type PlayOptions = {
  /** 最後の休憩の自然終了に由来する完了通知なら`true`です。 */
  readonly completionNotice?: boolean;
};

/** 完了音を再生し、終了時に子プロセスを片付ける処理です。 */
type SoundPlayer = {
  /** フェーズに対応する完了音を非同期で再生します。 */
  readonly play: (phase: TimerPhase, options?: PlayOptions) => void;

  /** 再生を打ち切り、子プロセスへ終了要求を送ります。 */
  readonly shutdown: (options: { readonly complete: boolean }) => Promise<void>;
};

/** 完了音の再生に必要な値と差し替えられる処理です。 */
type CreateSoundPlayerParameters = {
  /** 起動時に解決済みの再生コマンドです。 */
  readonly commands: PlayerCommands;

  /** 子プロセスへ引き継ぐ環境変数です。 */
  readonly environment?: NodeJS.ProcessEnv;

  /**
   * 同梱音源を置いたディレクトリのURLです。
   *
   * バンドル後は実装ファイルの位置が変わるため、エントリポイントから渡します。
   */
  readonly soundDirectory: URL;

  /** 音声再生プロセスを起動する処理です。 */
  readonly spawnChild?: SpawnChild;

  /** 子プロセスと操作の追跡処理です。指定時は`spawnChild`より優先します。 */
  readonly tracker?: OperationTracker;

  /** 再生できない場合にベルを書き込む処理です。 */
  readonly writeFallback?: (output: string) => void;
};

const FALLBACK_SOUNDS = { break: '\u0007\u0007', work: '\u0007' } as const,
  WINDOWS_SOUND_SCRIPT = [
    '$player = New-Object System.Media.SoundPlayer',
    '$player.SoundLocation = $env:POMOTTY_SOUND_FILE',
    '$player.PlaySync()',
  ].join('; '),
  /** フェーズに対応する同梱音源のパスを返します。 */
  soundFileFor = (soundDirectory: URL, phase: TimerPhase): string =>
    fileURLToPath(new URL(`${phase}-end.wav`, soundDirectory)),
  /**
   * 解決済みのコマンドから再生候補を試行順に返します。
   *
   * 音源パスはPowerShellのコードへ補間せず、環境変数で渡します。
   */
  commandsFor = (
    commands: PlayerCommands,
    soundFile: string,
    environment: NodeJS.ProcessEnv,
  ): readonly SoundCommand[] => {
    const candidates: SoundCommand[] = [];

    for (const commandPath of [commands.afplay, commands.paplay, commands.aplay]) {
      if (commandPath !== undefined) {
        candidates.push({ commandArguments: [soundFile], commandPath });
      }
    }

    if (commands.powershell !== undefined) {
      candidates.push({
        commandArguments: ['-NoProfile', '-NonInteractive', '-Command', WINDOWS_SOUND_SCRIPT],
        commandPath: commands.powershell,
        env: { ...environment, POMOTTY_SOUND_FILE: soundFile },
      });
    }

    return candidates;
  },
  /** 再生候補を成功するまで順番に試し、全候補が失敗した場合だけベルを鳴らします。 */
  runSoundCommands = async (
    operation: Operation,
    tracker: OperationTracker,
    candidates: readonly SoundCommand[],
    fallback: () => void,
  ): Promise<void> => {
    for (const candidate of candidates) {
      // 前の候補が失敗した場合だけ次の候補を試すため、順番に待機します。
      // oxlint-disable-next-line no-await-in-loop
      const result = await tracker.runChild(
        operation,
        candidate.commandPath,
        candidate.commandArguments,
        { env: candidate.env },
      );

      if (result !== 'failure' || tracker.isOperationCancelled(operation)) {
        return;
      }
    }

    if (!tracker.isOperationCancelled(operation)) {
      fallback();
    }
  },
  /**
   * 完了音の再生処理を作成します。
   *
   * OSの再生コマンドが使えない場合は、作業完了を1回、休憩完了を2回の
   * ターミナルベルで鳴らし分けます。各再生は10秒で打ち切り、再生完了は
   * タイマー進行を妨げません。
   *
   * @param parameters 解決済みコマンド、音源の場所、差し替える処理。
   * @returns 再生と終了処理。
   */
  createSoundPlayer = ({
    commands,
    environment = process.env,
    soundDirectory,
    spawnChild,
    tracker = createOperationTracker(spawnChild),
    writeFallback = createDiagnosticWriter(),
  }: CreateSoundPlayerParameters): SoundPlayer => ({
    play: (phase, { completionNotice = false } = {}) => {
      const candidates = commandsFor(commands, soundFileFor(soundDirectory, phase), environment),
        fallback = (): void => {
          writeFallback(FALLBACK_SOUNDS[phase]);
        };

      tracker.startOperation(completionNotice, (operation) =>
        runSoundCommands(operation, tracker, candidates, fallback),
      );
    },
    shutdown: (options) => tracker.shutdown(options),
  });

export { createSoundPlayer };
export type { CreateSoundPlayerParameters, PlayOptions, SoundPlayer };
