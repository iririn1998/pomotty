import { OPTIONS, VERSION } from './constants.ts';
import { listPresets, resolveTimerValues } from '#src/config/resolve.ts';
import { loadConfig, readConfigFileIfExists } from '#src/config/load.ts';
import type { ReadConfigFile } from '#src/config/load.ts';
import type { TimerValues } from '#src/config/values.ts';
import { createCliOutput } from '#src/terminal/render.ts';
import { formatPresetList } from './list-presets.ts';
import { parseCliArguments } from './parse-arguments.ts';

/**
 * CLI引数と設定ファイルから決まった、CLIが行う処理です。
 *
 * - `print`: `output`を表示して終了します。
 * - `error`: `message`を標準エラー出力へ書き、`exitCode`で終了します。
 * - `run`: `values`でタイマーを実行します。`finalBreak`は最後の作業の後にも休憩するかを示します。
 */
type CliRequest =
  | { readonly kind: 'print'; readonly output: string }
  | { readonly exitCode: number; readonly kind: 'error'; readonly message: string }
  | { readonly finalBreak: boolean; readonly kind: 'run'; readonly values: TimerValues };

/** CLIが行う処理を決めるための入力です。 */
type ResolveCliRequestParameters = {
  /** Node.jsとスクリプトのパスを除いたCLI引数です。 */
  readonly arguments_: readonly string[];

  /** 標準の設定ファイルのパスです。`undefined`なら標準の設定ファイルは読みません。 */
  readonly configPath: string | undefined;

  /** 設定ファイルを読み込む処理です。省略時はファイルシステムから読みます。 */
  readonly readConfigFile?: ReadConfigFile | undefined;
};

/** 設定ファイルを読めない、または内容が不正なときの終了コードです。 */
const CONFIG_ERROR_EXIT_CODE = 1,
  /** CLI引数が不正なときの終了コードです。 */
  USAGE_ERROR_EXIT_CODE = 2,
  /**
   * CLI引数を解析し、必要なら設定ファイルを読み込んで、CLIが行う処理を決めます。
   *
   * ヘルプ、バージョン、CLI引数のエラーは設定ファイルを読まずに決めます。そのため、
   * 設定ファイルが壊れていても`--help`は表示できます。
   */
  resolveCliRequest = async ({
    arguments_,
    configPath,
    readConfigFile = readConfigFileIfExists,
  }: ResolveCliRequestParameters): Promise<CliRequest> => {
    const parsedArguments = parseCliArguments(arguments_);

    if (parsedArguments.kind === 'error') {
      return { exitCode: USAGE_ERROR_EXIT_CODE, kind: 'error', message: parsedArguments.message };
    }

    if (parsedArguments.kind === 'help') {
      return { kind: 'print', output: createCliOutput({ optionName: '--help', options: OPTIONS }) };
    }

    if (parsedArguments.kind === 'version') {
      return { kind: 'print', output: `${VERSION}\n` };
    }

    const loadedConfig = await loadConfig({
      defaultPath: configPath,
      readFile: readConfigFile,
      selection: parsedArguments.config,
    });

    if (loadedConfig.kind === 'error') {
      return { exitCode: CONFIG_ERROR_EXIT_CODE, kind: 'error', message: loadedConfig.message };
    }

    if (parsedArguments.kind === 'list-presets') {
      return { kind: 'print', output: formatPresetList(listPresets(loadedConfig.config)) };
    }

    const resolved = resolveTimerValues({
      config: loadedConfig.config,
      overrides: parsedArguments.overrides,
      preset: parsedArguments.preset,
    });

    if (resolved.kind === 'error') {
      return { exitCode: USAGE_ERROR_EXIT_CODE, kind: 'error', message: resolved.message };
    }

    return { finalBreak: parsedArguments.finalBreak, kind: 'run', values: resolved.values };
  };

export { resolveCliRequest };
export type { CliRequest };
export type { ReadConfigFile } from '#src/config/load.ts';
