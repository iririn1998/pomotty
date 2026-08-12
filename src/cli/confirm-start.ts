import { on } from 'node:events';
import process from 'node:process';
import { emitKeypressEvents } from 'node:readline';

type SelectionKey = {
  readonly ctrl: boolean;
  readonly name: string;
};

type SelectionTerminal = {
  readonly nextKey: () => Promise<SelectionKey>;
  readonly restore: () => Promise<void>;
  readonly write: (output: string) => void;
};

type ConfirmWorkStartParameters = {
  readonly createTerminal?: () => SelectionTerminal;
};

const CHOICES = ['OK', 'NG'] as const,
  CONTROL_C_KEY_NAME = 'c',
  ENTER_KEY_NAMES = new Set(['enter', 'return']),
  FIRST_CHOICE_INDEX = 0,
  KEYPRESS_EVENT_KEY_INDEX = 1,
  MOVE_KEY_NAMES = new Set(['down', 'up']),
  NEXT_INDEX_OFFSET = 1,
  REDRAW_SEQUENCE = `\r\u001B[${CHOICES.length}A\u001B[J`,
  SELECTION_QUESTION = '作業を開始しますか？（↑↓で選択、Enterで決定）',
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
  createSelectionTerminal = (): SelectionTerminal => {
    emitKeypressEvents(process.stdin);

    const inputWasFlowing = process.stdin.readableFlowing === true,
      keypressEvents = on(process.stdin, 'keypress'),
      rawModeWasEnabled = process.stdin.isRaw === true,
      supportsRawMode = process.stdin.isTTY === true;
    let restored = false;

    if (supportsRawMode && !rawModeWasEnabled) {
      process.stdin.setRawMode(true);
    }

    if (!inputWasFlowing) {
      process.stdin.resume();
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
        const stopListening = keypressEvents.return;

        if (stopListening) {
          await stopListening.call(keypressEvents);
        }

        if (supportsRawMode && !rawModeWasEnabled) {
          process.stdin.setRawMode(false);
        }

        if (!inputWasFlowing) {
          process.stdin.pause();
        }
      },
      write: (output) => {
        process.stdout.write(output);
      },
    };
  },
  markerFor = (selected: boolean): string => {
    if (selected) {
      return '❯';
    }

    return ' ';
  },
  renderSelection = (selectedIndex: number): string =>
    [
      SELECTION_QUESTION,
      ...CHOICES.map((choice, index) => `${markerFor(index === selectedIndex)} ${choice}`),
    ].join('\n'),
  nextChoiceIndex = (selectedIndex: number): number => {
    if (selectedIndex === FIRST_CHOICE_INDEX) {
      return CHOICES.length - NEXT_INDEX_OFFSET;
    }

    return FIRST_CHOICE_INDEX;
  },
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
  /** 上下キーでOKまたはNGを選び、作業を開始するか確認します。 */
  confirmWorkStart = async ({
    createTerminal = createSelectionTerminal,
  }: ConfirmWorkStartParameters = {}): Promise<boolean> => {
    const terminal = createTerminal();
    let selectedIndex = FIRST_CHOICE_INDEX;

    terminal.write(renderSelection(selectedIndex));

    try {
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

export { confirmWorkStart };
export type { ConfirmWorkStartParameters, SelectionKey, SelectionTerminal };
