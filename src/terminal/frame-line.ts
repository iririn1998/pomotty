import type { TimerPhase } from '#src/timer/timer.ts';

/** 表示行を構成する文字列片です。`tone`がある場合だけ色を付けます。 */
type FrameSegment = {
  /** 表示する文字列です。改行とANSI制御列を含めません。 */
  readonly text: string;

  /** 色を付ける場合のフェーズです。 */
  readonly tone?: TimerPhase;
};

/** 端末の1物理行に対応する表示行です。 */
type FrameLine = readonly FrameSegment[];

const ELLIPSIS = '…',
  NO_WIDTH = 0,
  SINGLE_WIDTH = 1,
  DOUBLE_WIDTH = 2,
  /** 端末で2セル幅に表示される、アプリが出力する文字（絵文字、全角文字など）です。 */
  WIDE_CHARACTER =
    /[\u1100-\u115F\u2615\u2E80-\uA4CF\uAC00-\uD7A3\uF900-\uFAFF\uFE30-\uFE4F\uFF00-\uFF60\uFFE0-\uFFE6\u{1F300}-\u{1FAFF}]/u,
  /** 幅を持たない結合用の文字（ZWJ、異体字セレクタ）です。 */
  ZERO_WIDTH_CHARACTERS = new Set(['\u200D', '\uFE0E', '\uFE0F']),
  SGR_DEFAULT_FOREGROUND = '\u001B[39m',
  SGR_TONES = { break: '\u001B[32m', work: '\u001B[31m' } as const,
  /** 1文字の表示セル幅を返します。 */
  characterWidth = (character: string): number => {
    if (ZERO_WIDTH_CHARACTERS.has(character)) {
      return NO_WIDTH;
    }

    if (WIDE_CHARACTER.test(character)) {
      return DOUBLE_WIDTH;
    }

    return SINGLE_WIDTH;
  },
  /**
   * アプリが生成した文字列の表示セル幅を返します。
   *
   * 対象はタイマー画面で使う文字に限ります。絵文字と全角文字を2セル、
   * ZWJと異体字セレクタを0セル、それ以外（罫線、ブロック要素を含む）を
   * 1セルとして数えます。
   */
  cellWidth = (text: string): number =>
    [...text].reduce((width, character) => width + characterWidth(character), NO_WIDTH),
  /** 表示行のセル幅を返します。 */
  lineWidth = (line: FrameLine): number =>
    line.reduce((width, segment) => width + cellWidth(segment.text), NO_WIDTH),
  /** 文字列の先頭から、文字の途中で切らずにセル幅の上限まで取り出します。 */
  takeWithin = (text: string, maxWidth: number): string => {
    let taken = '',
      used = NO_WIDTH;

    for (const character of text) {
      used += characterWidth(character);

      if (used > maxWidth) {
        break;
      }

      taken += character;
    }

    return taken;
  },
  /** 表示行の先頭から、文字の途中で切らずにセル幅の上限まで文字列片を取り出します。 */
  takeSegmentsWithin = (line: FrameLine, maxWidth: number): FrameSegment[] => {
    const kept: FrameSegment[] = [];
    let remaining = maxWidth;

    for (const { text, tone } of line) {
      const taken = takeWithin(text, remaining);

      if (taken !== '') {
        kept.push({ text: taken, tone });
      }

      if (taken !== text) {
        break;
      }

      remaining -= cellWidth(taken);
    }

    return kept;
  },
  /**
   * 表示行をセル幅の上限へ収めます。
   *
   * 上限を超える場合は省略記号`…`の1セルを先に確保し、文字の途中で
   * 切らずに残りを詰めます。上限が1セルなら`…`だけを返します。
   */
  truncateLine = (line: FrameLine, maxWidth: number): FrameLine => {
    if (lineWidth(line) <= maxWidth) {
      return line;
    }

    return [...takeSegmentsWithin(line, maxWidth - cellWidth(ELLIPSIS)), { text: ELLIPSIS }];
  },
  /** 文字列片を、色が有効なら着色して返します。 */
  stringifySegment = ({ text, tone }: FrameSegment, color: boolean): string => {
    if (!color || !tone || text === '') {
      return text;
    }

    return `${SGR_TONES[tone]}${text}${SGR_DEFAULT_FOREGROUND}`;
  },
  /**
   * 表示行を端末へ書き込む文字列へ変換します。
   *
   * `color`が`true`の場合だけ、`tone`のある部分をWORKは赤、BREAKは緑で着色し、
   * 直後に前景色を既定値へ戻します。行末の空白は出力しません。
   */
  stringifyFrameLine = (line: FrameLine, color: boolean): string =>
    line
      .map((segment) => stringifySegment(segment, color))
      .join('')
      .trimEnd(),
  /**
   * 環境変数から色を使うかを判定します。
   *
   * `NO_COLOR`が空でない値で設定されている場合だけ色を無効にします。
   */
  isColorEnabled = (env: Readonly<Record<string, string | undefined>>): boolean =>
    (env.NO_COLOR ?? '') === '';

export { cellWidth, isColorEnabled, lineWidth, stringifyFrameLine, truncateLine };
export type { FrameLine, FrameSegment };
