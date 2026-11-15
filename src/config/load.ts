import type { Config, LoadConfigResult } from './parse.ts';
import { describeError, errorCode, parseConfig } from './parse.ts';
import { escapeDiagnostic } from '#src/diagnostics/escape.ts';
import { readFile } from 'node:fs/promises';

/**
 * どの設定ファイルを読むかの指定です。
 *
 * - `default`: 標準の場所の設定ファイルを、存在する場合だけ読みます。
 * - `file`: 指定したファイルを読みます。存在しなければエラーです。
 * - `none`: 設定ファイルを読みません。
 */
type ConfigSelection =
  | { readonly kind: 'default' }
  | { readonly kind: 'file'; readonly path: string }
  | { readonly kind: 'none' };

/**
 * 設定ファイルを文字列として読み込む処理です。
 *
 * ファイルが存在しない場合は`undefined`を返し、それ以外の失敗では例外を投げます。
 */
type ReadConfigFile = (path: string) => Promise<string | undefined>;

/** 設定ファイルの読み込みに必要な値です。 */
type LoadConfigParameters = {
  /** 標準の設定ファイルのパスです。`undefined`なら標準の設定ファイルは読みません。 */
  readonly defaultPath: string | undefined;

  /** 設定ファイルを読み込む処理です。 */
  readonly readFile: ReadConfigFile;

  /** どの設定ファイルを読むかの指定です。 */
  readonly selection: ConfigSelection;
};

const EMPTY_CONFIG: Config = { presets: new Map(), values: {} },
  /** ファイルが存在しないことを示すエラーコードです。 */
  NOT_FOUND_ERROR_CODES: ReadonlySet<unknown> = new Set(['ENOENT', 'ENOTDIR']),
  /** 設定ファイルを読み込みます。存在しない場合は`undefined`を返します。 */
  readConfigFileIfExists: ReadConfigFile = async (path) => {
    try {
      return await readFile(path, 'utf8');
    } catch (error) {
      if (NOT_FOUND_ERROR_CODES.has(errorCode(error))) {
        return;
      }

      throw error;
    }
  },
  /** 指定に応じて読む設定ファイルのパスを返します。読まない場合は`undefined`です。 */
  selectConfigPath = (
    selection: ConfigSelection,
    defaultPath: string | undefined,
  ): string | undefined => {
    if (selection.kind === 'file') {
      return selection.path;
    }

    if (selection.kind === 'default') {
      return defaultPath;
    }

    return undefined;
  },
  /**
   * 指定に応じて設定ファイルを読み込み、検証します。
   *
   * 標準の場所にファイルがなければ空の設定を返し、`--config`で指定した
   * ファイルがなければエラーにします。
   */
  loadConfig = async ({
    defaultPath,
    readFile: read,
    selection,
  }: LoadConfigParameters): Promise<LoadConfigResult> => {
    const path = selectConfigPath(selection, defaultPath);

    if (path === undefined) {
      return { config: EMPTY_CONFIG, kind: 'ok' };
    }

    let text: string | undefined;

    try {
      text = await read(path);
    } catch (error) {
      return {
        kind: 'error',
        message: `Error: Cannot read config file ${escapeDiagnostic(path)} (${escapeDiagnostic(describeError(error))}).\n`,
      };
    }

    if (text !== undefined) {
      return parseConfig(text, path);
    }

    if (selection.kind === 'file') {
      return {
        kind: 'error',
        message: `Error: Config file not found: ${escapeDiagnostic(path)}\n`,
      };
    }

    return { config: EMPTY_CONFIG, kind: 'ok' };
  };

export { EMPTY_CONFIG, loadConfig, readConfigFileIfExists };
export type { ConfigSelection, ReadConfigFile };
