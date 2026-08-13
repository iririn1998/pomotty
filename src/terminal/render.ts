import { LOGO } from './constants.ts';
import type { OptionDefinition } from '@/cli/types.ts';

/** CLI出力の生成に必要な値です。 */
type CreateCliOutputParameters = {
  /** CLIで利用できるオプションの定義一覧。 */
  readonly options: readonly OptionDefinition[];

  /** 判定対象のCLI引数。省略時は実行中プロセスの先頭引数を利用します。 */
  readonly optionName?: string;
};

/**
 * CLIへ渡されたオプションに応じた出力を生成します。
 *
 * オプションの名前または短縮形と一致した場合はヘルプを生成し、
 * 一致しない場合は通常起動時のロゴを返します。
 *
 * @param parameters CLI出力の生成に必要な値。
 * @returns 標準出力へ書き込む文字列。
 */
const CLI_OPTION_INDEX = 2,
  createCliOutput = ({
    options,
    optionName = process.argv.at(CLI_OPTION_INDEX),
  }: CreateCliOutputParameters): string => {
    const option = options.find(({ alias, name }) => alias === optionName || name === optionName);

    if (!option) {
      return `${LOGO}\n`;
    }

    return [
      'Pomotty CLI',
      '',
      'Usage: pomotty [OPTIONS]',
      '',
      'Options:',
      ...options.flatMap(({ alias, description, name }): readonly string[] => {
        const optionNames = [alias, name].filter(Boolean).join(', ');

        return [`  ${optionNames}`, `          ${description}`];
      }),
      '',
    ].join('\n');
  };

export { createCliOutput };
