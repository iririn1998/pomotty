import { DEFAULT_BREAK_DURATION_MINUTES, DEFAULT_WORK_DURATION_MINUTES } from '#src/timer/timer.ts';
import { DEFAULT_LOOP_COUNT, MAXIMUM_DURATION_MINUTES } from '#src/config/values.ts';
import { BUILTIN_PRESETS } from '#src/config/presets.ts';
import type { OptionDefinition } from './types.ts';

/**
 * CLIで現在案内しているオプションの一覧です。
 */
const OPTIONS = [
  {
    description: `Work duration in minutes (1-${MAXIMUM_DURATION_MINUTES}, default: ${DEFAULT_WORK_DURATION_MINUTES})`,
    name: '--work',
    valueName: '<minutes>',
  },
  {
    description: `Break duration in minutes (1-${MAXIMUM_DURATION_MINUTES}, default: ${DEFAULT_BREAK_DURATION_MINUTES})`,
    name: '--break',
    valueName: '<minutes>',
  },
  {
    description: `Work-break repetitions (positive integer, default: ${DEFAULT_LOOP_COUNT})`,
    name: '--loop',
    valueName: '<count>',
  },
  {
    alias: '-p',
    description: `Use a preset (built-in: ${[...BUILTIN_PRESETS.keys()].join(', ')})`,
    name: '--preset',
    valueName: '<name>',
  },
  {
    description: 'Read settings from this file instead of the default config file',
    name: '--config',
    valueName: '<path>',
  },
  {
    description: 'Do not read any config file',
    name: '--no-config',
  },
  {
    description: 'List available presets and exit',
    name: '--list-presets',
  },
  {
    alias: '-h',
    description: 'Print help',
    name: '--help',
  },
] as const satisfies readonly OptionDefinition[];

export { OPTIONS };
