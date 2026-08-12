/**
 * CLIのヘルプへ表示するオプションを定義
 */
export type OptionDefinition = {
  /** ユーザーへ表示するオプション名（`--help` や `-h` など） */
  readonly name: `--${string}` | `-${string}`;

  /** オプションの役割を説明する簡潔な文章 */
  readonly description: string;
};
