import { MILLISECONDS_PER_MINUTE, runPomodoroCycle } from '@/timer.ts';
import type { TimerPhase, Wait } from '@/timer.ts';
import { OPTIONS } from '@/constants/options.ts';
import { createCliOutput } from '@/cli/create-output.ts';
import { playCompletionSound } from '@/notification-sound.ts';
import process from 'node:process';

type WriteOutput = (output: string) => void;

type RunCliParameters = {
  readonly arguments_?: readonly string[];
  readonly playSound?: (phase: TimerPhase) => void;
  readonly wait?: Wait;
  readonly writeOutput?: WriteOutput;
};

const CLI_ARGUMENTS_START_INDEX = 2,
  EXPECTED_ARGUMENT_COUNT = 0,
  FIRST_ARGUMENT_INDEX = 0,
  PHASE_ICONS = { break: '☕', work: '🍅' } as const,
  PHASE_NAMES = { break: '休憩', work: '作業' } as const,
  runCli = async ({
    arguments_ = process.argv.slice(CLI_ARGUMENTS_START_INDEX),
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

    await runPomodoroCycle({
      onPhaseCompleted: (phase) => {
        writeOutput(`✅ ${PHASE_NAMES[phase]}が完了しました。\n`);
        playSound(phase);
      },
      onPhaseStarted: (phase, durationMs) => {
        const durationMinutes = durationMs / MILLISECONDS_PER_MINUTE;
        writeOutput(
          `${PHASE_ICONS[phase]} ${PHASE_NAMES[phase]}を開始します（${durationMinutes}分）\n`,
        );
      },
      wait,
    });

    writeOutput('🎉 1セット完了しました。\n');
  };

export { runCli };
export type { RunCliParameters, WriteOutput };
