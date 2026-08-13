import type { OptionDefinition } from './types.ts';

/**
 * CLIで現在案内しているオプションの一覧です。
 */
const OPTIONS = [
  {
    alias: '-h',
    description: 'Print help',
    name: '--help',
  },
] as const satisfies readonly OptionDefinition[];

export { OPTIONS };
