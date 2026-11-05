import type { WriteOutput } from './output.ts';

/** 同じ位置へ画面を描き直す処理です。 */
type InlineRenderer = {
  /**
   * 画面を描画します。直前と同じ内容なら何も書き込みません。
   *
   * 各行は改行を含まず、端末幅に収まっている必要があります。
   */
  readonly render: (lines: readonly string[]) => void;

  /** 現在の画面を消してから1行を出力します。次の描画は新しい位置から行います。 */
  readonly log: (output: string) => void;

  /**
   * 現在の画面を消さずに追跡をやめます。
   *
   * 端末幅の変更で既存の行が折り返された可能性がある場合に呼び出し、
   * 次の描画を現在のカーソル位置から追記します。
   */
  readonly release: () => void;
};

const CSI = '\u001B[',
  NO_ROWS = 0,
  CLEAR_LINE = `${CSI}2K`,
  /** カーソルを指定行数だけ上へ移動する制御列です。 */
  cursorUp = (rows: number): string => {
    if (rows <= NO_ROWS) {
      return '';
    }

    return `${CSI}${rows}A`;
  },
  /**
   * 前回の画面へ上書きして描き直す処理を作成します。
   *
   * 画面の各行の末尾には必ず改行を出力し、描画後のカーソルを画面直後の
   * 行の先頭に置きます。描き直すときは前回の先頭行へ戻り、各行を消して
   * から書き込みます。行数が減った場合は余った旧行も消します。画面末尾
   * 全体を消す制御列は使わず、画面より下の内容には触れません。
   */
  createInlineRenderer = (write: WriteOutput): InlineRenderer => {
    let previous: string | undefined,
      renderedRows = NO_ROWS;

    const eraseSequence = (): string =>
      `${cursorUp(renderedRows)}${`${CLEAR_LINE}\n`.repeat(renderedRows)}${cursorUp(renderedRows)}`;

    return {
      log: (output) => {
        write(`${eraseSequence()}${output}`);
        previous = undefined;
        renderedRows = NO_ROWS;
      },
      release: () => {
        previous = undefined;
        renderedRows = NO_ROWS;
      },
      render: (lines) => {
        const frame = lines.join('\n');

        if (frame === previous) {
          return;
        }

        const leftoverRows = Math.max(NO_ROWS, renderedRows - lines.length);

        write(
          [
            cursorUp(renderedRows),
            ...lines.map((line) => `${CLEAR_LINE}${line}\n`),
            `${CLEAR_LINE}\n`.repeat(leftoverRows),
            cursorUp(leftoverRows),
          ].join(''),
        );
        previous = frame;
        renderedRows = lines.length;
      },
    };
  };

export { createInlineRenderer };
export type { InlineRenderer };
