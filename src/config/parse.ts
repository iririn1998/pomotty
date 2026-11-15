import { BUILTIN_PRESETS, PRESET_NAME_RULE, isValidPresetName } from './presets.ts';
import type { PartialTimerValues, TimerValueKey } from './values.ts';
import { TIMER_VALUE_KEYS, describeTimerValueRange, isValidTimerValue } from './values.ts';
import { escapeDiagnostic } from '#src/diagnostics/escape.ts';

/** 読み込んだ設定ファイルの内容です。 */
type Config = {
  /** プリセットを指定しない場合に使うプリセット名です。 */
  readonly defaultPreset?: string;

  /** 設定ファイルで定義したプリセットです。組み込みと同じ名前なら組み込みを置き換えます。 */
  readonly presets: ReadonlyMap<string, PartialTimerValues>;

  /** トップレベルに書いたタイマーの値です。 */
  readonly values: PartialTimerValues;
};

/** 設定ファイルの読み込み結果です。 */
type LoadConfigResult =
  | { readonly config: Config; readonly kind: 'ok' }
  | { readonly kind: 'error'; readonly message: string };

/** JSONのオブジェクトです。 */
type JsonObject = Readonly<Record<string, unknown>>;

const BYTE_ORDER_MARK = /^﻿/u,
  /** プリセットに書けるキーです。 */
  PRESET_KEYS: ReadonlySet<string> = new Set(TIMER_VALUE_KEYS),
  /** トップレベルに書けるキーです。`$schema`はエディタ向けで、内容は使いません。 */
  TOP_LEVEL_KEYS: ReadonlySet<string> = new Set([
    ...TIMER_VALUE_KEYS,
    '$schema',
    'defaultPreset',
    'presets',
  ]),
  /** 値がJSONのオブジェクト（配列と`null`以外）か判定します。 */
  isJsonObject = (value: unknown): value is JsonObject =>
    typeof value === 'object' && value !== null && !Array.isArray(value),
  /** 例外値からNode.jsのエラーコードを取り出します。 */
  errorCode = (error: unknown): unknown => {
    if (isJsonObject(error)) {
      return error.code;
    }

    return undefined;
  },
  /** 例外値を診断に含める短い文字列へ変換します。 */
  describeError = (error: unknown): string => {
    const code = errorCode(error);

    if (typeof code === 'string') {
      return code;
    }

    if (error instanceof Error) {
      return error.message;
    }

    return 'unknown error';
  },
  /** 許可しないキーがあれば、そのキーを返します。 */
  findUnknownKey = (object: JsonObject, allowedKeys: ReadonlySet<string>): string | undefined =>
    Object.keys(object).find((key) => !allowedKeys.has(key)),
  /**
   * オブジェクトからタイマーの値を読み取ります。
   *
   * 範囲外の値があれば、診断の詳細を文字列で返します。
   */
  readTimerValues = (object: JsonObject, location: string): PartialTimerValues | string => {
    const values: Partial<Record<TimerValueKey, number>> = {};

    for (const key of TIMER_VALUE_KEYS) {
      if (Object.hasOwn(object, key)) {
        const value = object[key];

        if (!isValidTimerValue(key, value)) {
          return `${location}${key} must be ${describeTimerValueRange(key)}.`;
        }

        values[key] = value;
      }
    }

    return values;
  },
  /** `presets`の1件を読み取ります。不正なら診断の詳細を文字列で返します。 */
  readPreset = (name: string, value: unknown): PartialTimerValues | string => {
    const location = `presets.${name}`;

    if (!isJsonObject(value)) {
      return `${location} must be an object.`;
    }

    const unknownKey = findUnknownKey(value, PRESET_KEYS);

    if (unknownKey !== undefined) {
      return `Unknown key ${escapeDiagnostic(unknownKey)} in ${location}.`;
    }

    return readTimerValues(value, `${location}.`);
  },
  /** `presets`を読み取ります。不正なら診断の詳細を文字列で返します。 */
  readPresets = (object: JsonObject): ReadonlyMap<string, PartialTimerValues> | string => {
    const presets = new Map<string, PartialTimerValues>();

    if (!Object.hasOwn(object, 'presets')) {
      return presets;
    }

    if (!isJsonObject(object.presets)) {
      return 'presets must be an object.';
    }

    for (const [name, value] of Object.entries(object.presets)) {
      if (!isValidPresetName(name)) {
        return `Invalid preset name ${escapeDiagnostic(name)} (use ${PRESET_NAME_RULE}).`;
      }

      const preset = readPreset(name, value);

      if (typeof preset === 'string') {
        return preset;
      }

      presets.set(name, preset);
    }

    return presets;
  },
  /** `defaultPreset`を読み取って設定へ加えます。不正なら診断の詳細を文字列で返します。 */
  addDefaultPreset = (object: JsonObject, config: Config): Config | string => {
    if (!Object.hasOwn(object, 'defaultPreset')) {
      return config;
    }

    const name = object.defaultPreset;

    if (typeof name !== 'string') {
      return 'defaultPreset must be a string.';
    }

    if (!config.presets.has(name) && !BUILTIN_PRESETS.has(name)) {
      return `defaultPreset refers to an unknown preset ${escapeDiagnostic(name)}.`;
    }

    return { defaultPreset: name, presets: config.presets, values: config.values };
  },
  /** JSONの値を設定として読み取ります。不正なら診断の詳細を文字列で返します。 */
  readConfig = (value: unknown): Config | string => {
    if (!isJsonObject(value)) {
      return 'The top level must be an object.';
    }

    const unknownKey = findUnknownKey(value, TOP_LEVEL_KEYS);

    if (unknownKey !== undefined) {
      return `Unknown key ${escapeDiagnostic(unknownKey)}.`;
    }

    const values = readTimerValues(value, '');

    if (typeof values === 'string') {
      return values;
    }

    const presets = readPresets(value);

    if (typeof presets === 'string') {
      return presets;
    }

    return addDefaultPreset(value, { presets, values });
  },
  /** JSONを解析します。不正なら診断の詳細を文字列で返します。 */
  parseJson = (text: string): { readonly value: unknown } | string => {
    try {
      return { value: JSON.parse(text.replace(BYTE_ORDER_MARK, '')) };
    } catch (error) {
      // V8のエラーメッセージには入力の断片が含まれるため、端末を操作できないようエスケープします。
      return `Invalid JSON (${escapeDiagnostic(describeError(error))}).`;
    }
  },
  /** 設定ファイルの内容が不正なことを示す読み込み結果を生成します。 */
  invalidConfig = (path: string, detail: string): LoadConfigResult => ({
    kind: 'error',
    message: `Error: Invalid config file ${escapeDiagnostic(path)}: ${detail}\n`,
  }),
  /**
   * 設定ファイルの内容を解析し、検証します。
   *
   * 打ち間違いに気付けるよう、未知のキーや範囲外の値はすべてエラーにします。
   * Windowsのメモ帳などが付けるBOMは取り除きます。
   *
   * @param text 設定ファイルの内容。
   * @param path 診断に表示する設定ファイルのパス。
   */
  parseConfig = (text: string, path: string): LoadConfigResult => {
    const json = parseJson(text);

    if (typeof json === 'string') {
      return invalidConfig(path, json);
    }

    const config = readConfig(json.value);

    if (typeof config === 'string') {
      return invalidConfig(path, config);
    }

    return { config, kind: 'ok' };
  };

export { describeError, errorCode, parseConfig };
export type { Config, LoadConfigResult };
