import { DEFAULT_BREAK_DURATION_MINUTES, DEFAULT_WORK_DURATION_MINUTES } from '#src/timer/timer.ts';
import {
  DEFAULT_LOOP_COUNT,
  MAXIMUM_DURATION_MINUTES,
  MAXIMUM_LOOP_COUNT,
} from '#src/config/values.ts';
import { BUILTIN_PRESETS } from '#src/config/presets.ts';
import type { OptionDefinition } from './types.ts';
import packageJson from '#package.json' with { type: 'json' };

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
      description: `Work-break repetitions (1-${MAXIMUM_LOOP_COUNT}, default: ${DEFAULT_LOOP_COUNT})`,
      name: '--loop',
      valueName: '<count>',
    },
    {
      description: 'Take a break after the last work session (default: finish after work)',
      name: '--final-break',
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
    {
      alias: '-v',
      description: 'Print version',
      name: '--version',
    },
  ] as const satisfies readonly OptionDefinition[],
  /**
   * `package.json`に記載されたpomottyのバージョンです。
   *
   * バンドル時は値が`dist/cli.js`へ埋め込まれ、開発時はNode.jsがJSONとして読み込みます。
   */
  VERSION: string = packageJson.version;

export { OPTIONS, VERSION };
