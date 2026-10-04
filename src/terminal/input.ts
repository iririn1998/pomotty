import { on } from 'node:events';
import process from 'node:process';
import { emitKeypressEvents } from 'node:readline';

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
  REDRAW_SEQUENCE = `\r\u001B[${CHOICES.length}A\u001B[J`,
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
  /** 上下移動後の選択位置を返します。 */
  nextChoiceIndex = (selectedIndex: number): number => {
    if (selectedIndex === FIRST_CHOICE_INDEX) {
      return CHOICES.length - NEXT_INDEX_OFFSET;
    }

    return FIRST_CHOICE_INDEX;
  },
  /** キー入力を処理し、確定結果または次の選択位置を返します。 */
  handleKey = (
    key: SelectionKey,
    selectedIndex: number,
    terminal: SelectionTerminal,
  ): boolean | number => {
    if (key.ctrl && key.name === CONTROL_C_KEY_NAME) {
      terminal.write('\n');
      return false;
    }

    if (MOVE_KEY_NAMES.has(key.name)) {
      const newSelectedIndex = nextChoiceIndex(selectedIndex);

      terminal.write(`${REDRAW_SEQUENCE}${renderSelection(newSelectedIndex)}`);
      return newSelectedIndex;
    }

    if (ENTER_KEY_NAMES.has(key.name)) {
      terminal.write('\n');
      return CHOICES[selectedIndex] === 'OK';
    }

    return selectedIndex;
  },
  /**
   * 上下キーでOKまたはNGを選び、作業を開始するか確認します。
   *
   * NG、Ctrl+C、確定前のstdin終端、`signal`の中断では`false`を返します。
   * 初回描画を含むすべての出力を`try`内で行い、失敗しても端末状態を復元します。
   */
  confirmWorkStart = async ({
    createTerminal = createSelectionTerminal,
    ...terminalParameters
  }: ConfirmWorkStartParameters = {}): Promise<boolean> => {
    const terminal = createTerminal(terminalParameters);
    let selectedIndex = FIRST_CHOICE_INDEX;

    try {
      terminal.write(renderSelection(selectedIndex));

      for (;;) {
        const key = await terminal.nextKey(),
          selection = handleKey(key, selectedIndex, terminal);

        if (typeof selection === 'boolean') {
          return selection;
        }

        selectedIndex = selection;
      }
    } finally {
      await terminal.restore();
    }
  };

export { confirmWorkStart, createSelectionTerminal };
export type {
  ConfirmWorkStartParameters,
  SelectionInput,
  SelectionKey,
  SelectionTerminal,
  SelectionTerminalParameters,
};
