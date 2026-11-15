import type { TimerValues } from './values.ts';

/** プリセット名に使える文字と長さです。表示と診断を崩さないよう、英数字と`-`、`_`に限ります。 */
const PRESET_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,31}$/u,
  /** プリセット名に使える文字を利用者へ説明する文章です。 */
  PRESET_NAME_RULE = 'letters, digits, "-" or "_", up to 32 characters',
  /**
   * Pomottyに同梱するプリセットです。
   *
   * 公開した名前と値は利用者の動作に直結するため、変更や削除は互換性のない変更として扱います。
   */
  BUILTIN_PRESETS: ReadonlyMap<string, TimerValues> = new Map([
    ['classic', { break: 5, loop: 4, work: 25 }],
    ['deep', { break: 10, loop: 2, work: 50 }],
    ['quick', { break: 3, loop: 3, work: 15 }],
  ]),
  /** 文字列がプリセット名として使えるか判定します。 */
  isValidPresetName = (name: string): boolean => PRESET_NAME_PATTERN.test(name);

export { BUILTIN_PRESETS, PRESET_NAME_RULE, isValidPresetName };
