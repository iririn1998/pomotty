import { MILLISECONDS_PER_MINUTE, runPomodoroTimer } from '#src/timer/timer.ts';
import type { Now, Sleep, TimerPhase } from '#src/timer/timer.ts';
import type { OutputStream, WriteOutput } from '#src/terminal/output.ts';
import { createStandardOutput, isBrokenPipe } from '#src/terminal/output.ts';
import { OPTIONS } from '#src/cli/constants.ts';
import type { SoundPlayer } from '#src/notification/sound.ts';
import { confirmWorkStart } from '#src/terminal/input.ts';
import { createCliOutput } from '#src/terminal/render.ts';
import { createDiagnosticWriter } from '#src/diagnostics/writer.ts';
import { parseCliArguments } from '#src/cli/parse-arguments.ts';
import process from 'node:process';

/** CLIの標準エラー出力へ文字列を書き込む処理です。 */
type WriteError = (output: string) => void;

/** 作業開始を確認する処理へ渡す値です。 */
type ConfirmStartParameters = {
  /** 終了処理の開始時に中断されるシグナルです。 */
  readonly signal: AbortSignal;

  /** 選択画面を出力する処理です。 */
  readonly write: WriteOutput;
};

/** CLI実行時に差し替えられる処理を定義します。 */
type RunCliParameters = {
  /** Node.jsとスクリプトのパスを除いたCLI引数です。 */
  readonly arguments_?: readonly string[];

  /** 作業開始を確認する処理です。 */
  readonly confirmStart?: (parameters: ConfirmStartParameters) => Promise<boolean>;

  /**
   * 完了音の再生処理を作成します。
   *
   * 引数検証に成功した後、端末を初期化する前に1回だけ呼び出すため、
   * 再生コマンドの絶対パスはこの時点で解決して保持します。
   */
  readonly createSoundPlayer: () => SoundPlayer;

  /** 現在時刻を返す処理です。 */
  readonly now?: Now;

  /** タイマーのtick間隔だけ待機する処理です。 */
  readonly sleep?: Sleep;

  /** 標準出力です。 */
  readonly stdout?: OutputStream;

  /** CLIのエラーを書き込む処理です。 */
  readonly writeError?: WriteError;

  /** 戻り値の確定後に判明した出力失敗の終了コードを設定する処理です。 */
  readonly setExitCode?: (exitCode: number) => void;

  /** 親プロセスを期限後に強制終了する処理を登録します。 */
  readonly scheduleExit?: (exitCode: number, delayMs: number) => void;
};

const CLI_ARGUMENTS_START_INDEX = 2,
  FAILURE_EXIT_CODE = 1,
  PHASE_ICONS = { break: '☕', work: '🍅' } as const,
  PHASE_NAMES = { break: 'Break', work: 'Work' } as const,
  SUCCESS_EXIT_CODE = 0,
  USAGE_ERROR_EXIT_CODE = 2,
  /** 完了終了以外で、終了処理の開始から親プロセスを強制終了するまでの上限です。 */
  SHUTDOWN_DEADLINE_MS = 2000,
  /** 完了終了で、完了通知の猶予を含めて親プロセスを強制終了するまでの上限です。 */
  COMPLETION_SHUTDOWN_DEADLINE_MS = 5000,
  /** フェーズ開始メッセージを生成します。 */
  createPhaseStartedOutput = (phase: TimerPhase, durationMs: number): string => {
    const durationMinutes = durationMs / MILLISECONDS_PER_MINUTE;
    return `${PHASE_ICONS[phase]} ${PHASE_NAMES[phase]} started (${durationMinutes} min)\n`;
  },
  /** 出力失敗に対応する終了コードを返します。閉じたパイプは正常終了として扱います。 */
  exitCodeForOutputFailure = (error: unknown): number => {
    if (isBrokenPipe(error)) {
      return SUCCESS_EXIT_CODE;
    }

    return FAILURE_EXIT_CODE;
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
  /** 期限に達しても親プロセスが残っていれば強制終了します。 */
  scheduleProcessExit = (exitCode: number, delayMs: number): void => {
    setTimeout(() => {
      // 終了しない子プロセスがあっても、期限で親プロセスを終了させるための最終手段です。
      // oxlint-disable-next-line unicorn/no-process-exit
      process.exit(exitCode);
    }, delayMs).unref();
  },
  /** プロセスの終了コードを設定します。 */
  setProcessExitCode = (exitCode: number): void => {
    process.exitCode = exitCode;
  },
  /** ヘルプを表示します。出力先が閉じていれば、閉じたパイプだけを正常終了とします。 */
  runHelp = (stdout: OutputStream | undefined, setExitCode: (exitCode: number) => void): number => {
    let exitCode = SUCCESS_EXIT_CODE;
    const writeOutput = createStandardOutput((error) => {
      exitCode = exitCodeForOutputFailure(error);
      setExitCode(exitCode);
    }, stdout);

    writeOutput(createCliOutput({ optionName: '--help', options: OPTIONS }));
    return exitCode;
  },
  /** 作業開始を確認し、指定回数のポモドーロサイクルを実行します。 */
  runCli = async ({
    arguments_ = process.argv.slice(CLI_ARGUMENTS_START_INDEX),
    confirmStart = confirmWorkStart,
    createSoundPlayer,
    now,
    scheduleExit = scheduleProcessExit,
    setExitCode = setProcessExitCode,
    sleep,
    stdout,
    writeError = createDiagnosticWriter(),
  }: RunCliParameters): Promise<number> => {
    const parsedArguments = parseCliArguments(arguments_);

    if (parsedArguments.kind === 'error') {
      emitDiagnostic(writeError, parsedArguments.message);
      return USAGE_ERROR_EXIT_CODE;
    }

    if (parsedArguments.kind === 'help') {
      return runHelp(stdout, setExitCode);
    }

    const controller = new AbortController();
    let shutdownExitCode: number | undefined, soundPlayer: SoundPlayer | undefined;

    /**
     * 終了処理を1回だけ開始します。
     *
     * 最初の呼び出しで終了コードを固定し、確認待ちとタイマーを中断して、
     * 再生中の子プロセスへ終了要求を送ります。親プロセスは期限に達すると
     * 強制終了するため、終了しない子プロセスがあっても残り続けません。
     */
    const requestShutdown = (exitCode: number, complete: boolean): number => {
        if (shutdownExitCode !== undefined) {
          return shutdownExitCode;
        }

        shutdownExitCode = exitCode;
        setExitCode(exitCode);
        controller.abort();
        void soundPlayer?.shutdown({ complete });

        if (complete) {
          scheduleExit(exitCode, COMPLETION_SHUTDOWN_DEADLINE_MS);
        } else {
          scheduleExit(exitCode, SHUTDOWN_DEADLINE_MS);
        }

        return exitCode;
      },
      writeOutput = createStandardOutput((error) => {
        requestShutdown(exitCodeForOutputFailure(error), false);
      }, stdout);

    try {
      soundPlayer = createSoundPlayer();
      writeOutput(createCliOutput({ optionName: '', options: OPTIONS }));

      if (shutdownExitCode !== undefined) {
        return shutdownExitCode;
      }

      const confirmed = await confirmStart({ signal: controller.signal, write: writeOutput });

      if (shutdownExitCode !== undefined) {
        return shutdownExitCode;
      }

      if (!confirmed) {
        writeOutput('⏹️ Work was not started.\n');
        return requestShutdown(SUCCESS_EXIT_CODE, false);
      }

      const player = soundPlayer,
        result = await runPomodoroTimer({
          breakDurationMs: parsedArguments.breakDurationMinutes * MILLISECONDS_PER_MINUTE,
          loopCount: parsedArguments.loopCount,
          now,
          onPhaseCompleted: (phase, { final }) => {
            writeOutput(`✅ ${PHASE_NAMES[phase]} complete.\n`);
            player.play(phase, { completionNotice: final });
          },
          onPhaseStarted: (phase, durationMs) => {
            writeOutput(createPhaseStartedOutput(phase, durationMs));
          },
          signal: controller.signal,
          sleep,
          workDurationMs: parsedArguments.workDurationMinutes * MILLISECONDS_PER_MINUTE,
        });

      if (!result.completed) {
        return shutdownExitCode ?? FAILURE_EXIT_CODE;
      }

      writeOutput('🎉 Pomodoro complete.\n');
      return requestShutdown(SUCCESS_EXIT_CODE, true);
    } catch (error) {
      requestShutdown(FAILURE_EXIT_CODE, false);
      throw error;
    }
  };

export { COMPLETION_SHUTDOWN_DEADLINE_MS, SHUTDOWN_DEADLINE_MS, runCli };
export type { ConfirmStartParameters, RunCliParameters, WriteError };
