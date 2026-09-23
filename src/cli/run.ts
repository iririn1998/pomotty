import { MILLISECONDS_PER_MINUTE, runPomodoroCycle } from '@/timer/timer.ts';
import type { TimerPhase, Wait } from '@/timer/timer.ts';
import { OPTIONS } from '@/cli/constants.ts';
import { confirmWorkStart } from '@/terminal/input.ts';
import { createCliOutput } from '@/terminal/render.ts';
import { createDiagnosticWriter } from '@/diagnostics/writer.ts';
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
  COUNT_INCREMENT = 1,
  PHASE_ICONS = { break: '☕', work: '🍅' } as const,
  PHASE_NAMES = { break: 'Break', work: 'Work' } as const,
  SUCCESS_EXIT_CODE = 0,
  USAGE_ERROR_EXIT_CODE = 2,
  /** フェーズ開始メッセージを生成します。 */
  createPhaseStartedOutput = (phase: TimerPhase, durationMs: number): string => {
    const durationMinutes = durationMs / MILLISECONDS_PER_MINUTE;

    return `${PHASE_ICONS[phase]} ${PHASE_NAMES[phase]} started (${durationMinutes} min)\n`;
  },
  /**
   * 診断を1回だけ書き込み、失敗しても呼び出し元へ伝播させません。
   *
   * 診断を出力できなくても引数エラーは引数エラーなので、終了コードを
   * 変えてはならず、同じ出力先へ診断を書き直してもいけません。
   */
  emitDiagnostic = (writeError: WriteError, message: string): void => {
    try {
      writeError(message);
    } catch {
      // 出力先が閉じている場合など。ここで握りつぶすのが期待動作です。
    }
  },
  /** CLIの標準出力へ書き込みます。 */
  emitStandardOutput: WriteOutput = (output) => {
    process.stdout.write(output);
  },
  /** 作業開始を確認し、指定回数のポモドーロサイクルを実行します。 */
  runCli = async ({
    arguments_ = process.argv.slice(CLI_ARGUMENTS_START_INDEX),
    confirmStart = confirmWorkStart,
    playSound = playCompletionSound,
    wait,
    writeError = createDiagnosticWriter(),
    writeOutput = emitStandardOutput,
  }: RunCliParameters = {}): Promise<number> => {
    const parsedArguments = parseCliArguments(arguments_);

    if (parsedArguments.kind === 'error') {
      emitDiagnostic(writeError, parsedArguments.message);
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

    for (
      let cycleIndex = 0;
      cycleIndex < parsedArguments.roopCount;
      cycleIndex += COUNT_INCREMENT
    ) {
      // 各サイクルは前の休憩が完了してから開始します。
      // oxlint-disable-next-line no-await-in-loop
      await runPomodoroCycle({
        breakDurationMs: parsedArguments.breakDurationMinutes * MILLISECONDS_PER_MINUTE,
        onPhaseCompleted: (phase) => {
          writeOutput(`✅ ${PHASE_NAMES[phase]} complete.\n`);
          playSound(phase);
        },
        onPhaseStarted: (phase, durationMs) =>
          writeOutput(createPhaseStartedOutput(phase, durationMs)),
        wait,
        workDurationMs: parsedArguments.workDurationMinutes * MILLISECONDS_PER_MINUTE,
      });
    }

    writeOutput('🎉 Pomodoro complete.\n');
    return SUCCESS_EXIT_CODE;
  };

export { runCli };
export type { RunCliParameters, WriteError, WriteOutput };
