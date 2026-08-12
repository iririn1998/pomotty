/**
 * CLIのヘルプへ表示するオプションを定義
 */
export type OptionDefinition = {
  /** ユーザーへ表示するロングオプション名（`--help` など） */
  readonly name: `--${string}`;

  /** ロングオプションと同じ動作をする短縮形（`-h` など） */
  readonly alias?: `-${string}`;

  /** オプションの役割を説明する簡潔な文章 */
  readonly description: string;
};
