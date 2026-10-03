import { DEFAULT_BREAK_DURATION_MINUTES, DEFAULT_WORK_DURATION_MINUTES } from '#src/timer/timer.ts';
import type { OptionDefinition } from './types.ts';

/** `--loop`を指定しない場合に作業と休憩を繰り返す回数です。 */
const DEFAULT_LOOP_COUNT = 3,
  /**
   * CLIで現在案内しているオプションの一覧です。
   */
  OPTIONS = [
    {
      description: `Work duration in minutes (1-1440, default: ${DEFAULT_WORK_DURATION_MINUTES})`,
      name: '--work',
      valueName: '<minutes>',
    },
    {
      description: `Break duration in minutes (1-1440, default: ${DEFAULT_BREAK_DURATION_MINUTES})`,
      name: '--break',
      valueName: '<minutes>',
    },
    {
      description: `Work-break repetitions (positive integer, default: ${DEFAULT_LOOP_COUNT})`,
      name: '--loop',
      valueName: '<count>',
    },
    {
      alias: '-h',
      description: 'Print help',
      name: '--help',
    },
  ] as const satisfies readonly OptionDefinition[];

export { DEFAULT_LOOP_COUNT, OPTIONS };
