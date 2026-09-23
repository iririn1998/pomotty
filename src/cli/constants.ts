import { DEFAULT_BREAK_DURATION_MINUTES, DEFAULT_WORK_DURATION_MINUTES } from '@/timer/timer.ts';
import type { OptionDefinition } from './types.ts';

/**
 * CLIで現在案内しているオプションの一覧です。
 */
const DEFAULT_ROOP_COUNT = 3,
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
      description: `Work-break repetitions (positive integer, default: ${DEFAULT_ROOP_COUNT})`,
      name: '--roop',
      valueName: '<count>',
    },
    {
      alias: '-h',
      description: 'Print help',
      name: '--help',
    },
  ] as const satisfies readonly OptionDefinition[];

export { DEFAULT_ROOP_COUNT, OPTIONS };
