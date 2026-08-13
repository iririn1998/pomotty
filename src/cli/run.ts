import { MILLISECONDS_PER_MINUTE, runPomodoroCycle } from '@/timer/timer.ts';
import type { TimerPhase, Wait } from '@/timer/timer.ts';
import { OPTIONS } from '@/cli/constants.ts';
import { confirmWorkStart } from '@/terminal/input.ts';
import { createCliOutput } from '@/terminal/render.ts';
import { playCompletionSound } from '@/notification/sound.ts';
import process from 'node:process';

/** CLIの標準出力へ文字列を書き込む処理です。 */
type WriteOutput = (output: string) => void;

/** CLI実行時に差し替えられる処理を定義します。 */
type RunCliParameters = {
  /** Node.jsとスクリプトのパスを除いたCLI引数です。 */
  readonly arguments_?: readonly string[];

  /** 作業開始を確認する処理です。 */
  readonly confirmStart?: () => Promise<boolean>;

  /** フェーズ完了音を再生する処理です。 */
  readonly playSound?: (phase: TimerPhase) => void;

  /** 指定時間だけ待機する処理です。 */
  readonly wait?: Wait;

  /** CLIの出力を書き込む処理です。 */
  readonly writeOutput?: WriteOutput;
};

const CLI_ARGUMENTS_START_INDEX = 2,
  EXPECTED_ARGUMENT_COUNT = 0,
  FIRST_ARGUMENT_INDEX = 0,
  PHASE_ICONS = { break: '☕', work: '🍅' } as const,
  PHASE_NAMES = { break: 'Break', work: 'Work' } as const,
  /** 作業開始を確認し、1回のポモドーロサイクルを実行します。 */
  runCli = async ({
    arguments_ = process.argv.slice(CLI_ARGUMENTS_START_INDEX),
    confirmStart = confirmWorkStart,
    playSound = playCompletionSound,
    wait,
    writeOutput = (output) => {
      process.stdout.write(output);
    },
  }: RunCliParameters = {}): Promise<void> => {
    writeOutput(
      createCliOutput({
        optionName: arguments_.at(FIRST_ARGUMENT_INDEX) ?? '',
        options: OPTIONS,
      }),
    );

    // 現時点ではオプションなしの起動だけがタイマーを開始します。
    if (arguments_.length !== EXPECTED_ARGUMENT_COUNT) {
      return;
    }

    if (!(await confirmStart())) {
      writeOutput('⏹️ Work was not started.\n');
      return;
    }

    await runPomodoroCycle({
      onPhaseCompleted: (phase) => {
        writeOutput(`✅ ${PHASE_NAMES[phase]} complete.\n`);
        playSound(phase);
      },
      onPhaseStarted: (phase, durationMs) => {
        const durationMinutes = durationMs / MILLISECONDS_PER_MINUTE;
        writeOutput(
          `${PHASE_ICONS[phase]} ${PHASE_NAMES[phase]} started (${durationMinutes} min)\n`,
        );
      },
      wait,
    });

    writeOutput('🎉 Pomodoro complete.\n');
  };

export { runCli };
export type { RunCliParameters, WriteOutput };
