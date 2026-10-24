import { EventEmitter } from 'node:events';
import type { OutputStream } from './output.ts';
import { cellWidth } from './frame-line.ts';

/** 前景色です。`undefined`は既定の色です。 */
type Color = 'green' | 'red' | undefined;

/** 画面の1セルです。2セル幅の文字は先頭セルに置き、続くセルを`continuation`にします。 */
type Cell = {
  /** セルに表示する文字です。結合文字は直前の文字と同じセルへ連結します。 */
  readonly text: string;

  /** 文字の前景色です。 */
  readonly color: Color;

  /** 2セル幅の文字の後半なら`true`です。 */
  readonly continuation: boolean;
};

/**
 * 書き込まれた制御列を解釈し、端末に見える画面を再現する偽の標準出力です。
 *
 * アプリが使う制御列（カーソル移動、行消去、色、カーソルの表示切り替え）だけを
 * 解釈し、それ以外の制御列は誤った出力として例外にします。行は上限なく保持する
 * ため、スクロールで画面外へ出た行も`lines()`に含まれます。右端を超える文字は
 * 実際の端末と同じく次の行へ折り返し、その回数を`wraps()`で返します。
 */
type VirtualTerminal = OutputStream & {
  /** 端末の列数です。 */
  readonly columns: number;

  /** 画面の各行です。行末の空白と末尾の空行は含めません。 */
  readonly lines: () => readonly string[];

  /** 画面の末尾から指定した行数を返します。 */
  readonly lastLines: (count: number) => readonly string[];

  /** 画面全体を改行で連結した文字列です。 */
  readonly text: () => string;

  /** 色の付いた部分を`<red>…</red>`や`<green>…</green>`で囲んだ画面の各行です。 */
  readonly coloredLines: () => readonly string[];

  /** 書き込まれた生の文字列です。 */
  readonly raw: () => string;

  /** カーソルが表示されているかを返します。 */
  readonly cursorVisible: () => boolean;

  /** 右端を超えて自動で折り返した回数です。 */
  readonly wraps: () => number;

  /** 鳴らしたベルの回数です。 */
  readonly bells: () => number;

  /** 列数を変更し、`resize`イベントを発生させます。 */
  readonly resize: (columns: number) => void;

  /** `error`イベントを発生させます。 */
  readonly emitError: (error: unknown) => void;

  /** 登録されている`resize`リスナーの数です。 */
  readonly resizeListenerCount: () => number;
};

/** 偽の端末を作成するときの値です。 */
type VirtualTerminalOptions = {
  /** 端末の列数です。 */
  readonly columns?: number;

  /** TTYとして振る舞うかを示します。 */
  readonly isTTY?: boolean;
};

const DEFAULT_COLUMNS = 80,
  ESCAPE = '\u001B',
  BELL = '\u0007',
  /** 制御列、または1文字に一致します。 */
  // 端末の制御列を解釈するため、ESCに一致させます。
  // oxlint-disable-next-line no-control-regex
  TOKEN = /\u001B\[(?<parameters>[?\d;]*)(?<command>[A-Za-z])|[\s\S]/gu,
  ZERO_WIDTH = 0,
  NOT_FOUND = -1,
  SGR_COLORS: Readonly<Record<string, Color>> = {
    '0': undefined,
    '31': 'red',
    '32': 'green',
    '39': undefined,
  },
  BLANK: Cell = { color: undefined, continuation: false, text: ' ' },
  /** 条件を満たす最後の要素の位置を返します。見つからなければ`-1`です。 */
  lastIndexWhere = <Value>(
    values: readonly Value[],
    predicate: (value: Value, index: number) => boolean,
  ): number => {
    for (let index = values.length - 1; index >= 0; index -= 1) {
      const value = values[index];

      if (value !== undefined && predicate(value, index)) {
        return index;
      }
    }

    return NOT_FOUND;
  },
  /** 制御列の数値引数を返します。省略時は`fallback`です。 */
  numericParameter = (parameters: string, fallback: number): number => {
    if (parameters === '') {
      return fallback;
    }

    return Number(parameters);
  },
  /** セルの並びを、行末の空白を除いた文字列へ変換します。 */
  plainRow = (row: readonly Cell[]): string =>
    row
      .filter((cell) => !cell.continuation)
      .map((cell) => cell.text)
      .join('')
      .trimEnd(),
  /** セルの並びを、色の付いた部分をタグで囲んだ文字列へ変換します。 */
  coloredRow = (row: readonly Cell[]): string => {
    let current: Color,
      output = '';

    for (const cell of row.filter((value) => !value.continuation)) {
      const { color } = cell;

      if (color !== current) {
        output += current === undefined ? '' : `</${current}>`;
        output += color === undefined ? '' : `<${color}>`;
        current = color;
      }

      output += cell.text;
    }

    return `${output}${current === undefined ? '' : `</${current}>`}`.trimEnd();
  },
  /** 末尾の空行を除きます。 */
  trimTrailingBlankRows = (rows: readonly string[]): readonly string[] => {
    const lastIndex = lastIndexWhere(rows, (row) => row.replaceAll(/<\/?\w+>/gu, '').trim() !== '');

    return rows.slice(0, lastIndex + 1);
  },
  /**
   * 偽の端末を作成します。
   *
   * @param options 列数とTTYかどうか。
   */
  createVirtualTerminal = ({
    columns: initialColumns = DEFAULT_COLUMNS,
    isTTY = true,
  }: VirtualTerminalOptions = {}): VirtualTerminal => {
    const emitter = new EventEmitter(),
      rows: Cell[][] = [[]];
    let bellCount = 0,
      color: Color,
      column = 0,
      columns = initialColumns,
      cursorShown = true,
      pendingWrap = false,
      raw = '',
      row = 0,
      wrapCount = 0;

    const currentRow = (): Cell[] => {
        while (rows.length <= row) {
          rows.push([]);
        }

        return rows[row] ?? [];
      },
      setCell = (index: number, cell: Cell): void => {
        const cells = currentRow();

        while (cells.length < index) {
          cells.push(BLANK);
        }

        cells[index] = cell;
      },
      newLine = (): void => {
        row += 1;
        column = 0;
        pendingWrap = false;
        currentRow();
      },
      putCharacter = (character: string): void => {
        const width = cellWidth(character);

        if (width === ZERO_WIDTH) {
          const cells = currentRow(),
            target = lastIndexWhere(cells, (cell, index) => index < column && !cell.continuation),
            previous = cells[target];

          if (previous !== undefined) {
            cells[target] = { ...previous, text: `${previous.text}${character}` };
          }

          return;
        }

        if (pendingWrap || column + width > columns) {
          wrapCount += 1;
          newLine();
        }

        setCell(column, { color, continuation: false, text: character });

        if (width > 1) {
          setCell(column + 1, { color, continuation: true, text: '' });
        }

        column += width;

        if (column >= columns) {
          column = columns - 1;
          pendingWrap = true;
        }
      },
      applySgr = (parameters: string): void => {
        for (const parameter of (parameters === '' ? '0' : parameters).split(';')) {
          if (!(parameter in SGR_COLORS)) {
            throw new Error(`未対応のSGR引数です: ${JSON.stringify(parameter)}`);
          }

          color = SGR_COLORS[parameter];
        }
      },
      applyControlSequence = (parameters: string, command: string): void => {
        const sequence = `${parameters}${command}`;

        if (sequence === '?25l' || sequence === '?25h') {
          cursorShown = command === 'h';
          return;
        }

        if (command === 'A') {
          row = Math.max(0, row - numericParameter(parameters, 1));
          pendingWrap = false;
          return;
        }

        if (sequence === '2K') {
          rows[row] = [];
          pendingWrap = false;
          return;
        }

        if (sequence === 'J' || sequence === '0J') {
          rows[row] = currentRow().slice(0, column);
          rows.splice(row + 1);
          return;
        }

        if (command === 'm') {
          applySgr(parameters);
          return;
        }

        throw new Error(`未対応の制御列です: ${JSON.stringify(`${ESCAPE}[${sequence}`)}`);
      },
      interpret = (output: string): void => {
        for (const match of output.matchAll(TOKEN)) {
          const [token] = match,
            { command, parameters } = match.groups ?? {};

          if (command !== undefined) {
            applyControlSequence(parameters ?? '', command);
          } else if (token === '\n') {
            newLine();
          } else if (token === '\r') {
            column = 0;
            pendingWrap = false;
          } else if (token === BELL) {
            bellCount += 1;
          } else if (token === ESCAPE || token < ' ') {
            throw new Error(`未対応の制御文字です: ${JSON.stringify(token)}`);
          } else {
            putCharacter(token);
          }
        }
      },
      lines = (): readonly string[] => trimTrailingBlankRows(rows.map((cells) => plainRow(cells)));

    return {
      bells: () => bellCount,
      coloredLines: () => trimTrailingBlankRows(rows.map((cells) => coloredRow(cells))),
      get columns() {
        return columns;
      },
      cursorVisible: () => cursorShown,
      emitError: (error) => {
        emitter.emit('error', error);
      },
      fd: undefined,
      isTTY,
      lastLines: (count) => lines().slice(-count),
      lines,
      off: (event, listener) => emitter.off(event, listener),
      on: (event, listener) => emitter.on(event, listener),
      raw: () => raw,
      resize: (newColumns) => {
        columns = newColumns;
        emitter.emit('resize');
      },
      resizeListenerCount: () => emitter.listenerCount('resize'),
      text: () => lines().join('\n'),
      wraps: () => wrapCount,
      write: (output) => {
        raw += output;
        interpret(output);
        return true;
      },
    };
  };

export { createVirtualTerminal };
export type { VirtualTerminal, VirtualTerminalOptions };
