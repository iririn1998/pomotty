import type { PartialTimerValues, TimerValueKey, TimerValues } from './values.ts';
import { BUILTIN_PRESETS } from './presets.ts';
import type { Config } from './parse.ts';
import { DEFAULT_TIMER_VALUES } from './values.ts';
import { escapeDiagnostic } from '#src/diagnostics/escape.ts';

/** タイマーの値を決めるための入力です。 */
type ResolveTimerValuesParameters = {
  /** 読み込んだ設定ファイルの内容です。 */
  readonly config: Config;

  /** CLIで指定した値です。 */
  readonly overrides: PartialTimerValues;

  /** CLIで指定したプリセット名です。 */
  readonly preset?: string | undefined;
};

/** タイマーの値を決めた結果です。 */
type ResolveTimerValuesResult =
  | { readonly kind: 'ok'; readonly values: TimerValues }
  | { readonly kind: 'error'; readonly message: string };

/**
 * プリセットの定義元です。
 *
 * `config-override`は、設定ファイルで組み込みと同じ名前を定義して置き換えたものです。
 */
type PresetSource = 'built-in' | 'config' | 'config-override';

/** プリセット一覧の1件です。 */
type PresetEntry = {
  /** 設定ファイルの`defaultPreset`で指定されているかを示します。 */
  readonly isDefault: boolean;

  /** プリセット名です。 */
  readonly name: string;

  /** 定義元です。 */
  readonly source: PresetSource;

  /** 省略した項目を補った、実際に使われる値です。 */
  readonly values: TimerValues;
};

const NO_VALUES: PartialTimerValues = {},
  /** 名前に対応するプリセットを返します。設定ファイルの定義を組み込みより優先します。 */
  findPreset = (config: Config, name: string): PartialTimerValues | undefined =>
    config.presets.get(name) ?? BUILTIN_PRESETS.get(name),
  /** 優先順位の高いものから順に値を重ね、組み込みの標準値ですべての項目を埋めます。 */
  mergeTimerValues = (layers: readonly PartialTimerValues[]): TimerValues => {
    const pick = (key: TimerValueKey): number =>
      layers.map((layer) => layer[key]).find((value) => typeof value === 'number') ??
      DEFAULT_TIMER_VALUES[key];

    return { break: pick('break'), loop: pick('loop'), work: pick('work') };
  },
  /**
   * CLI引数、プリセット、設定ファイル、組み込みの標準値からタイマーの値を決めます。
   *
   * 優先順位は`CLI引数 > プリセット > 設定ファイルのトップレベル > 組み込みの標準値`です。
   * CLIでプリセットを指定しなければ、設定ファイルの`defaultPreset`を使います。
   */
  resolveTimerValues = ({
    config,
    overrides,
    preset = config.defaultPreset,
  }: ResolveTimerValuesParameters): ResolveTimerValuesResult => {
    let presetValues = NO_VALUES;

    if (preset !== undefined) {
      const found = findPreset(config, preset);

      if (found === undefined) {
        return {
          kind: 'error',
          message: `Error: Unknown preset: ${escapeDiagnostic(preset)}. Run "pomotty --list-presets" to see available presets.\n`,
        };
      }

      presetValues = found;
    }

    return { kind: 'ok', values: mergeTimerValues([overrides, presetValues, config.values]) };
  },
  /** 定義元を判定します。 */
  presetSource = (config: Config, name: string): PresetSource => {
    if (!config.presets.has(name)) {
      return 'built-in';
    }

    if (BUILTIN_PRESETS.has(name)) {
      return 'config-override';
    }

    return 'config';
  },
  /**
   * 使えるプリセットを、組み込み、設定ファイルの順に列挙します。
   *
   * 組み込みを置き換えたプリセットは、組み込みの位置に1件だけ並べます。
   */
  listPresets = (config: Config): readonly PresetEntry[] =>
    [...new Set([...BUILTIN_PRESETS.keys(), ...config.presets.keys()])].map((name) => ({
      isDefault: config.defaultPreset === name,
      name,
      source: presetSource(config, name),
      values: mergeTimerValues([findPreset(config, name) ?? NO_VALUES, config.values]),
    }));

export { listPresets, resolveTimerValues };
export type { PresetEntry, PresetSource, ResolveTimerValuesResult };
