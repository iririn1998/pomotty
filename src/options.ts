/**
 * CLIのヘルプへ表示するオプションを定義
 */
type OptionDefinition = {
  /** ユーザーへ表示するオプション名（`--help` や `-h` など） */
  readonly name: `--${string}` | `-${string}`;
  
  /** オプションの役割を説明する簡潔な文章 */
  readonly description: string;
};

/**
 * CLIで現在案内しているオプションの一覧
 */
const OPTIONS = [
  {
    description: 'Display this help message.',
    name: '--help',
  },
  {
    description: 'Display this help message.',
    name: '-h',
  },
] as const satisfies readonly OptionDefinition[];

export { OPTIONS, type OptionDefinition };
