import type { OptionDefinition } from '@/types/options.ts';

/**
 * CLIで現在案内しているオプションの一覧
 */
export const OPTIONS = [
  {
    alias: '-h',
    description: 'Print help',
    name: '--help',
  },
] as const satisfies readonly OptionDefinition[];
