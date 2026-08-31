import { DEFAULT_BREAK_DURATION_MINUTES, DEFAULT_WORK_DURATION_MINUTES } from '@/timer/timer.ts';
import type { OptionDefinition } from './types.ts';

/**
 * CLIで現在案内しているオプションの一覧です。
 */
const OPTIONS = [
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
    alias: '-h',
    description: 'Print help',
    name: '--help',
  },
] as const satisfies readonly OptionDefinition[];

export { OPTIONS };
