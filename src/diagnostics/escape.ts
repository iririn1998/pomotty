const BACKSLASH = '\\',
  BIDIRECTIONAL_PATTERN = /[\u061C\u200B\u200E\u200F\u2028-\u202E\u2066-\u206F\uFEFF]/u,
  CONTROL_HEX_LENGTH = 2,
  CONTROL_PATTERN = /[\u0000-\u001F\u007F-\u009F]/u,
  EMPTY_CODE_POINT = 0,
  FIRST_INDEX = 0,
  HEXADECIMAL_RADIX = 16,
  HEX_PAD_CHARACTER = '0',
  MAXIMUM_CODE_POINTS = 160,
  QUOTATION_MARK = '"',
  SURROGATE_HEX_LENGTH = 4,
  SURROGATE_PATTERN = /[\uD800-\uDFFF]/u,
  TRUNCATION_MARK = '…',
  UNPADDED_HEX_LENGTH = 0,
  /**
   * 1文字をコードポイント値の大文字16進数へ変換します。
   *
   * 呼び出し元は必ず1文字を渡すため、コードポイントの取得は失敗しません。
   */
  characterToHexadecimal = (character: string, length: number): string =>
    (character.codePointAt(FIRST_INDEX) ?? EMPTY_CODE_POINT)
      .toString(HEXADECIMAL_RADIX)
      .toUpperCase()
      .padStart(length, HEX_PAD_CHARACTER),
  /** 端末表示を偽装できる1文字を、コードポイント表記へ変換します。 */
  escapeUnsafeCharacter = (character: string): string => {
    if (CONTROL_PATTERN.test(character)) {
      return String.raw`\x${characterToHexadecimal(character, CONTROL_HEX_LENGTH)}`;
    }

    if (BIDIRECTIONAL_PATTERN.test(character)) {
      return String.raw`\u{${characterToHexadecimal(character, UNPADDED_HEX_LENGTH)}}`;
    }

    if (SURROGATE_PATTERN.test(character)) {
      return String.raw`\u${characterToHexadecimal(character, SURROGATE_HEX_LENGTH)}`;
    }

    return character;
  },
  /** 1文字を診断へ安全に埋め込める表記へ変換します。 */
  escapeCharacter = (character: string): string => {
    if (character === BACKSLASH) {
      return String.raw`\\`;
    }

    if (character === QUOTATION_MARK) {
      return String.raw`\"`;
    }

    return escapeUnsafeCharacter(character);
  },
  /**
   * ユーザー由来の文字列を診断へ埋め込める表記へ変換します。
   *
   * 制御文字、双方向制御文字、対応しないサロゲートをエスケープし、
   * 160コードポイントで切り詰めたうえで二重引用符で囲みます。
   * これにより改行やANSIによる診断表示の偽装と、無制限の出力を防ぎます。
   *
   * @param value エスケープ対象のユーザー由来の文字列。
   * @returns 二重引用符で囲んだ1行の有限長文字列。
   */
  escapeDiagnostic = (value: string): string => {
    const codePoints = [...value],
      escaped = codePoints
        .slice(FIRST_INDEX, MAXIMUM_CODE_POINTS)
        .map((character) => escapeCharacter(character))
        .join('');

    if (codePoints.length > MAXIMUM_CODE_POINTS) {
      return `${QUOTATION_MARK}${escaped}${TRUNCATION_MARK}${QUOTATION_MARK}`;
    }

    return `${QUOTATION_MARK}${escaped}${QUOTATION_MARK}`;
  };

export { escapeDiagnostic };
