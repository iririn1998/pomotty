import { DEFAULT_BREAK_DURATION_MINUTES, DEFAULT_WORK_DURATION_MINUTES } from '#src/timer/timer.ts';
import type { OptionDefinition } from './types.ts';
import packageJson from '#package.json' with { type: 'json' };

/** `--loop`を指定しない場合に作業と休憩を繰り返す回数です。 */
const DEFAULT_LOOP_COUNT = 3,
  /** `--loop`で指定できる繰り返し回数の上限です。 */
  MAXIMUM_LOOP_COUNT = 100,
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
      description: `Work-break repetitions (1-${MAXIMUM_LOOP_COUNT}, default: ${DEFAULT_LOOP_COUNT})`,
      name: '--loop',
      valueName: '<count>',
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

export { DEFAULT_LOOP_COUNT, MAXIMUM_LOOP_COUNT, OPTIONS, VERSION };
