import { COMPACT_LOGO, LOGO } from './constants.ts';
import type { OptionDefinition } from '#src/cli/types.ts';
import { cellWidth } from './frame-line.ts';

/** CLI出力の生成に必要な値です。 */
type CreateCliOutputParameters = {
  /** CLIで利用できるオプションの定義一覧。 */
  readonly options: readonly OptionDefinition[];

  /** 判定対象のCLI引数。省略時は実行中プロセスの先頭引数を利用します。 */
  readonly optionName?: string;

  /** 端末の列数です。ロゴが収まらない場合は短い見出しを返します。 */
  readonly columns?: number;
};

const CLI_OPTION_INDEX = 2,
  /** ロゴの最も長い行のセル幅です。 */
  LOGO_WIDTH = Math.max(...LOGO.split('\n').map((line) => cellWidth(line))),
  /** 端末の自動折り返しを避けるために右端で空けるセル数です。 */
  RIGHT_MARGIN = 1,
  /** 端末の列数でロゴが折り返されずに表示できるかを判定します。列数が不明なら表示できるとみなします。 */
  canShowLogo = (columns: number | undefined): boolean =>
    !columns || LOGO_WIDTH <= columns - RIGHT_MARGIN,
  /**
   * CLIへ渡されたオプションに応じた出力を生成します。
   *
   * オプションの名前または短縮形と一致した場合はヘルプを生成し、
   * 一致しない場合は通常起動時のロゴを返します。端末がロゴより狭い場合は、
   * 折り返して崩れないよう短い見出しを返します。
   *
   * @param parameters CLI出力の生成に必要な値。
   * @returns 標準出力へ書き込む文字列。
   */
  createCliOutput = ({
    columns,
    options,
    optionName = process.argv.at(CLI_OPTION_INDEX),
  }: CreateCliOutputParameters): string => {
    const option = options.find(({ alias, name }) => alias === optionName || name === optionName);

    if (!option && canShowLogo(columns)) {
      return `${LOGO}\n`;
    }

    if (!option) {
      return `${COMPACT_LOGO}\n`;
    }

    return [
      'Pomotty CLI',
      '',
      'Usage: pomotty [OPTIONS]',
      '',
      'Options:',
      ...options.flatMap(({ alias, description, name, valueName }): readonly string[] => {
        const longOptionName = [name, valueName].filter(Boolean).join(' '),
          optionNames = [alias, longOptionName].filter(Boolean).join(', ');

        return [`  ${optionNames}`, `          ${description}`];
      }),
      '',
    ].join('\n');
  };

export { createCliOutput };
