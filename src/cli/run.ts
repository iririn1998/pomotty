import { MILLISECONDS_PER_MINUTE, runPomodoroCycle } from '@/timer/timer.ts';
import type { TimerPhase, Wait } from '@/timer/timer.ts';
import { OPTIONS } from '@/cli/constants.ts';
import { confirmWorkStart } from '@/terminal/input.ts';
import { createCliOutput } from '@/terminal/render.ts';
import { parseCliArguments } from '@/cli/parse-arguments.ts';
import { playCompletionSound } from '@/notification/sound.ts';
import process from 'node:process';

/** CLIの標準出力へ文字列を書き込む処理です。 */
type WriteOutput = (output: string) => void;

/** CLIの標準エラー出力へ文字列を書き込む処理です。 */
type WriteError = (output: string) => void;

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

  /** CLIのエラーを書き込む処理です。 */
  readonly writeError?: WriteError;
};

const CLI_ARGUMENTS_START_INDEX = 2,
  PHASE_ICONS = { break: '☕', work: '🍅' } as const,
  PHASE_NAMES = { break: 'Break', work: 'Work' } as const,
  SUCCESS_EXIT_CODE = 0,
  USAGE_ERROR_EXIT_CODE = 2,
  /** 作業開始を確認し、1回のポモドーロサイクルを実行します。 */
  runCli = async ({
    arguments_ = process.argv.slice(CLI_ARGUMENTS_START_INDEX),
    confirmStart = confirmWorkStart,
    playSound = playCompletionSound,
    wait,
    writeError = (output) => {
      process.stderr.write(output);
    },
    writeOutput = (output) => {
      process.stdout.write(output);
    },
  }: RunCliParameters = {}): Promise<number> => {
    const parsedArguments = parseCliArguments(arguments_);

    if (parsedArguments.kind === 'error') {
      writeError(parsedArguments.message);
      return USAGE_ERROR_EXIT_CODE;
    }

    if (parsedArguments.kind === 'help') {
      writeOutput(createCliOutput({ optionName: '--help', options: OPTIONS }));
      return SUCCESS_EXIT_CODE;
    }

    writeOutput(createCliOutput({ optionName: '', options: OPTIONS }));

    if (!(await confirmStart())) {
      writeOutput('⏹️ Work was not started.\n');
      return SUCCESS_EXIT_CODE;
    }

    await runPomodoroCycle({
      breakDurationMs: parsedArguments.breakDurationMinutes * MILLISECONDS_PER_MINUTE,
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
      workDurationMs: parsedArguments.workDurationMinutes * MILLISECONDS_PER_MINUTE,
    });

    writeOutput('🎉 Pomodoro complete.\n');
    return SUCCESS_EXIT_CODE;
  };

export { runCli };
export type { RunCliParameters, WriteError, WriteOutput };
