/**
 * CLIのヘルプへ表示するオプションを定義します。
 */
type OptionDefinition = {
  /** ユーザーへ表示するロングオプション名（`--help` など）。 */
  readonly name: `--${string}`;

  /** ロングオプションと同じ動作をする短縮形（`-h` など）。 */
  readonly alias?: `-${string}`;

  /** オプションの役割を説明する簡潔な文章。 */
  readonly description: string;

  /** オプションが受け取る値の表示名（`<minutes>` など）。 */
  readonly valueName?: `<${string}>`;
};

export type { OptionDefinition };
