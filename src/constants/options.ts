import type { OptionDefinition } from '@/types/options.ts';

/**
 * CLIで現在案内しているオプションの一覧
 */
export const OPTIONS = [
  {
    description: 'Display this help message.',
    name: '--help',
  },
  {
    description: 'Display this help message.',
    name: '-h',
  },
] as const satisfies readonly OptionDefinition[];
