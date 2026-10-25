import { on } from 'node:events';
import process from 'node:process';
import { emitKeypressEvents } from 'node:readline';
import { cellWidth } from './frame-line.ts';

/** 選択操作に必要なキー情報です。 */
type SelectionKey = {
  /** Ctrlキーが押されているかを示します。 */
  readonly ctrl: boolean;

  /** 正規化済みのキー名です。 */
  readonly name: string;
};

/** 選択画面が利用するターミナル操作です。 */
type SelectionTerminal = {
  /** 次のキー入力を待ちます。 */
  readonly nextKey: () => Promise<SelectionKey>;

  /** 変更したターミナル状態を元に戻します。 */
  readonly restore: () => Promise<void>;

  /** 選択画面を出力します。 */
  readonly write: (output: string) => void;
};

/** 選択画面の描画、消去、出力を行う処理です。 */
type SelectionMenu = {
  /** 最後に描画した選択画面を消すシーケンスを返します。 */
  readonly clear: () => string;

  /** 選択位置を反映した選択画面を返し、その行数を記録します。 */
  readonly render: (selectedIndex: number) => string;

  /** 選択画面を出力します。 */
  readonly write: (output: string) => void;
};

/** 選択画面が読み取る入力ストリームです。 */
type SelectionInput = NodeJS.ReadableStream & {
  /** Raw modeが有効かを示します。 */
  readonly isRaw?: boolean;

  /** TTYかを示します。 */
  readonly isTTY?: boolean;

  /** Flowing状態を示します。 */
  readonly readableFlowing?: boolean | null;

  /** Raw modeを切り替えます。 */
  readonly setRawMode?: (mode: boolean) => unknown;
};

/** 選択画面用のターミナル操作を作成するときの値です。 */
type SelectionTerminalParameters = {
  /** キー入力を読み取るストリームです。 */
  readonly input?: SelectionInput;

  /** 確認を打ち切るシグナルです。中断時は確定前の終端として扱います。 */
  readonly signal?: AbortSignal;

  /** 選択画面を出力する処理です。 */
  readonly write?: (output: string) => void;
};

/** 作業開始確認時に差し替えられる処理を定義します。 */
type ConfirmWorkStartParameters = SelectionTerminalParameters & {
  /**
   * 描画時点の端末の列数を返します。
   *
   * 折り返した行も含めて選択画面を消すために使います。`undefined`なら折り返さないものとします。
   */
  readonly columns?: () => number | undefined;

  /** 選択画面用のターミナル操作を作成します。 */
  readonly createTerminal?: (parameters: SelectionTerminalParameters) => SelectionTerminal;
};

const CHOICES = ['OK', 'NG'] as const,
  CONTROL_C_KEY_NAME = 'c',
  ENTER_KEY_NAMES = new Set(['enter', 'return']),
  FIRST_CHOICE_INDEX = 0,
  KEYPRESS_EVENT_KEY_INDEX = 1,
  MOVE_KEY_NAMES = new Set(['down', 'up']),
  NEXT_INDEX_OFFSET = 1,
  NO_ROWS = 0,
  SINGLE_ROW = 1,
  /** 確定前の終端として扱うstdinのイベントです。 */
  STDIN_CLOSE_EVENTS = ['end', 'close'],
  SELECTION_QUESTION = 'Start working? (Use ↑/↓ to select, Enter to confirm)',
  /** キーイベントの値を選択操作用の形式へ変換します。 */
  keyFrom = (value: unknown): SelectionKey => {
    let key = {},
      normalizedName = '';

    if (typeof value === 'object' && value !== null) {
      key = value;
    }

    const ctrl = Reflect.get(key, 'ctrl'),
      name = Reflect.get(key, 'name');

    if (typeof name === 'string') {
      normalizedName = name;
    }

    return { ctrl: ctrl === true, name: normalizedName };
  },
  /**
   * 標準入出力から選択画面用のターミナル操作を作成します。
   *
   * stdinの`end`または`close`、あるいは`signal`の中断でキー入力の待機を
   * 終えるため、確定前にstdinが終端してもPromiseが未解決のまま残りません。
   */
  createSelectionTerminal = ({
    input = process.stdin,
    signal,
    write = (output) => {
      process.stdout.write(output);
    },
  }: SelectionTerminalParameters = {}): SelectionTerminal => {
    emitKeypressEvents(input);

    const inputWasFlowing = input.readableFlowing === true,
      keypressEvents = on(input, 'keypress', { close: STDIN_CLOSE_EVENTS }),
      rawModeWasEnabled = input.isRaw === true,
      supportsRawMode = input.isTTY === true && typeof input.setRawMode === 'function',
      stopListening = (): void => {
        void keypressEvents.return?.();
      };
    let restored = false;

    signal?.addEventListener('abort', stopListening, { once: true });

    if (signal?.aborted) {
      stopListening();
    }

    if (supportsRawMode && !rawModeWasEnabled) {
      input.setRawMode?.(true);
    }

    if (!inputWasFlowing) {
      input.resume();
    }

    return {
      nextKey: async () => {
        const event = await keypressEvents.next();

        if (event.done) {
          return { ctrl: true, name: CONTROL_C_KEY_NAME };
        }

        return keyFrom(event.value.at(KEYPRESS_EVENT_KEY_INDEX));
      },
      restore: async () => {
        if (restored) {
          return;
        }

        restored = true;
        signal?.removeEventListener('abort', stopListening);
        await keypressEvents.return?.();

        if (supportsRawMode && !rawModeWasEnabled) {
          input.setRawMode?.(false);
        }

        if (!inputWasFlowing) {
          input.pause();
        }
      },
      write,
    };
  },
  /** 選択中の項目へ表示するマーカーを返します。 */
  markerFor = (selected: boolean): string => {
    if (selected) {
      return '❯';
    }

    return ' ';
  },
  /** 現在の選択位置を反映したメニューを生成します。 */
  renderSelection = (selectedIndex: number): string =>
    [
      SELECTION_QUESTION,
      ...CHOICES.map((choice, index) => `${markerFor(index === selectedIndex)} ${choice}`),
    ].join('\n'),
  /**
   * 文字列を端末へ出力したときに占める行数を返します。
   *
   * 列数を超える行は端末が自動で折り返すため、その分の行も数えます。
   */
  rowsOf = (output: string, columns: number | undefined): number => {
    const lines = output.split('\n');
    let rows = NO_ROWS;

    if (!columns || columns < SINGLE_ROW) {
      return lines.length;
    }

    for (const line of lines) {
      rows += Math.max(SINGLE_ROW, Math.ceil(cellWidth(line) / columns));
    }

    return rows;
  },
  /** 指定した行数の描画済み選択画面を消し、カーソルを質問行の先頭へ戻すシーケンスを返します。 */
  clearSelectionSequence = (rows: number): string => `\r\u001B[${rows - SINGLE_ROW}A\u001B[J`,
  /** 上下移動後の選択位置を返します。 */
  nextChoiceIndex = (selectedIndex: number): number => {
    if (selectedIndex === FIRST_CHOICE_INDEX) {
      return CHOICES.length - NEXT_INDEX_OFFSET;
    }

    return FIRST_CHOICE_INDEX;
  },
  /** キー入力を処理し、確定結果または次の選択位置を返します。 */
  handleKey = (key: SelectionKey, selectedIndex: number, menu: SelectionMenu): boolean | number => {
    if (key.ctrl && key.name === CONTROL_C_KEY_NAME) {
      menu.write('\n');
      return false;
    }

    if (MOVE_KEY_NAMES.has(key.name)) {
      const newSelectedIndex = nextChoiceIndex(selectedIndex);

      menu.write(`${menu.clear()}${menu.render(newSelectedIndex)}`);
      return newSelectedIndex;
    }

    if (ENTER_KEY_NAMES.has(key.name)) {
      if (CHOICES[selectedIndex] === 'OK') {
        // OKではタイマー画面へ移るため、確認の表示を残しません。
        menu.write(menu.clear());
        return true;
      }

      menu.write('\n');
      return false;
    }

    return selectedIndex;
  },
  /**
   * 上下キーでOKまたはNGを選び、作業を開始するか確認します。
   *
   * OKでは確認の表示を消して`true`を返します。
   * NG、Ctrl+C、確定前のstdin終端、`signal`の中断では`false`を返します。
   * 初回描画を含むすべての出力を`try`内で行い、失敗しても端末状態を復元します。
   */
  confirmWorkStart = async ({
    columns,
    createTerminal = createSelectionTerminal,
    ...terminalParameters
  }: ConfirmWorkStartParameters = {}): Promise<boolean> => {
    const terminal = createTerminal(terminalParameters);
    let drawnRows = NO_ROWS,
      selectedIndex = FIRST_CHOICE_INDEX;
    // 消去する行数は、描画した時点の列数で折り返した行数に合わせます。
    const menu: SelectionMenu = {
      clear: () => clearSelectionSequence(drawnRows),
      render: (index) => {
        const output = renderSelection(index);

        drawnRows = rowsOf(output, columns?.());
        return output;
      },
      write: terminal.write,
    };

    try {
      menu.write(menu.render(selectedIndex));

      for (;;) {
        const key = await terminal.nextKey(),
          selection = handleKey(key, selectedIndex, menu);

        if (typeof selection === 'boolean') {
          return selection;
        }

        selectedIndex = selection;
      }
    } finally {
      await terminal.restore();
    }
  };

export { CONTROL_C_KEY_NAME, confirmWorkStart, createSelectionTerminal, keyFrom };
export type {
  ConfirmWorkStartParameters,
  SelectionInput,
  SelectionKey,
  SelectionTerminal,
  SelectionTerminalParameters,
};
