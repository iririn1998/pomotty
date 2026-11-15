import { confirmWorkStart } from './input.ts';
import type { SelectionKey, SelectionTerminal } from './input.ts';
import { describe, expect, test, vi } from 'vitest';
import { PassThrough } from 'node:stream';

type FakeInput = PassThrough & {
  readonly isRaw: boolean;
  readonly isTTY: boolean;
  readonly rawModes: readonly boolean[];
  readonly setRawMode: (mode: boolean) => PassThrough;
};

type ConfirmationResult = {
  readonly confirmed: boolean;
  readonly restoreCount: number;
  readonly writes: readonly string[];
};

const COUNT_INCREMENT = 1,
  MENU_WITH_NO_SELECTED = ['Start working? (y/n, or ↑/↓ and Enter)', '  Yes', '❯ No'].join('\n'),
  MENU_WITH_YES_SELECTED = ['Start working? (y/n, or ↑/↓ and Enter)', '❯ Yes', '  No'].join('\n'),
  REDRAW_SEQUENCE = '\r\u001B[2A\u001B[J',
  key = (name: string, ctrl = false): SelectionKey => ({ ctrl, name }),
  confirmFor = (keys: readonly SelectionKey[]): Promise<ConfirmationResult> => {
    const remainingKeys = [...keys],
      writes: string[] = [];
    let restoreCount = 0;

    return confirmWorkStart({
      createTerminal: (): SelectionTerminal => ({
        nextKey: () => Promise.resolve(remainingKeys.shift() ?? key('return')),
        restore: () => {
          restoreCount += COUNT_INCREMENT;
          return Promise.resolve();
        },
        write: (output) => {
          writes.push(output);
        },
      }),
    }).then((confirmed) => ({ confirmed, restoreCount, writes }));
  };

test('初期選択のYesをEnterで決定すると確認の表示を消す', async () => {
  const result = await confirmFor([key('return')]);

  expect(result).toEqual({
    confirmed: true,
    restoreCount: 1,
    writes: [MENU_WITH_YES_SELECTED, REDRAW_SEQUENCE],
  });
});

test('上下キーでNoへ移動してEnterで決定できる', async () => {
  const result = await confirmFor([key('down'), key('return')]);

  expect(result).toEqual({
    confirmed: false,
    restoreCount: 1,
    writes: [MENU_WITH_YES_SELECTED, `${REDRAW_SEQUENCE}${MENU_WITH_NO_SELECTED}`, '\n'],
  });
});

test('yで即座にYesで確定し、確認の表示を消す', async () => {
  const result = await confirmFor([key('y')]);

  expect(result).toEqual({
    confirmed: true,
    restoreCount: 1,
    writes: [MENU_WITH_YES_SELECTED, REDRAW_SEQUENCE],
  });
});

test('Noを選んだ状態でもyではYesで確定する', async () => {
  const result = await confirmFor([key('down'), key('y')]);

  expect(result).toMatchObject({ confirmed: true });
  expect(result.writes.at(-1)).toBe(REDRAW_SEQUENCE);
});

test.each(['n', 'escape'])('%sで即座にNoで確定し、Noを選んだ表示を残す', async (name) => {
  const result = await confirmFor([key(name)]);

  expect(result).toEqual({
    confirmed: false,
    restoreCount: 1,
    writes: [MENU_WITH_YES_SELECTED, `${REDRAW_SEQUENCE}${MENU_WITH_NO_SELECTED}`, '\n'],
  });
});

test('Noを選んだ状態でnを押すと描き直さずに確定する', async () => {
  const result = await confirmFor([key('down'), key('n')]);

  expect(result).toEqual({
    confirmed: false,
    restoreCount: 1,
    writes: [MENU_WITH_YES_SELECTED, `${REDRAW_SEQUENCE}${MENU_WITH_NO_SELECTED}`, '\n'],
  });
});

test.each(['y', 'n'])('Ctrl+%sは無視する', async (name) => {
  const result = await confirmFor([key(name, true), key('return')]);

  expect(result).toEqual({
    confirmed: true,
    restoreCount: 1,
    writes: [MENU_WITH_YES_SELECTED, REDRAW_SEQUENCE],
  });
});

test('選択に使わないキーは無視する', async () => {
  const result = await confirmFor([key('a'), key('return')]);

  expect(result).toEqual({
    confirmed: true,
    restoreCount: 1,
    writes: [MENU_WITH_YES_SELECTED, REDRAW_SEQUENCE],
  });
});

test('Ctrl+Cでは作業を開始せず端末状態を復元する', async () => {
  const result = await confirmFor([key('c', true)]);

  expect(result).toEqual({
    confirmed: false,
    restoreCount: 1,
    writes: [MENU_WITH_YES_SELECTED, '\n'],
  });
});

test('初回描画が失敗しても端末状態を復元する', async () => {
  let restoreCount = 0;
  const failure = new Error('stdout closed');

  await expect(
    confirmWorkStart({
      createTerminal: (): SelectionTerminal => ({
        nextKey: () => Promise.resolve(key('return')),
        restore: () => {
          restoreCount += COUNT_INCREMENT;
          return Promise.resolve();
        },
        write: () => {
          throw failure;
        },
      }),
    }),
  ).rejects.toBe(failure);
  expect(restoreCount).toBe(1);
});

/** TTYとして振る舞い、raw modeの切り替えを記録する入力ストリームを作成します。 */
const createInput = (isTTY: boolean): FakeInput => {
    const input = new PassThrough(),
      rawModes: boolean[] = [];
    let isRaw = false;

    // Object.assignはgetterを値として複製するため、現在値を返すgetterを定義します。
    return Object.defineProperty(
      Object.assign(input, {
        isTTY,
        rawModes,
        setRawMode: (mode: boolean) => {
          rawModes.push(mode);
          isRaw = mode;
          return input;
        },
      }),
      'isRaw',
      { get: () => isRaw },
    ) as unknown as FakeInput;
  },
  confirmWith = (
    input: FakeInput,
    signal?: AbortSignal,
  ): { confirmation: Promise<boolean>; writes: string[] } => {
    const writes: string[] = [];

    return {
      confirmation: confirmWorkStart({
        input,
        signal,
        write: (output) => {
          writes.push(output);
        },
      }),
      writes,
    };
  };

describe('実際のストリームを使う開始確認', () => {
  test('確定前にstdinが終端するとfalseを返し、入力の待機を終える', async () => {
    const input = createInput(false),
      pause = vi.spyOn(input, 'pause'),
      { confirmation, writes } = confirmWith(input);

    input.end();

    expect(await confirmation).toBe(false);
    expect(writes).toEqual([MENU_WITH_YES_SELECTED, '\n']);
    // Node.js 26以降は終端済みストリームのpause()でflowing状態が変わらないため、
    // 状態ではなく、アプリが開始したflowingを戻す呼び出しを確認します。
    expect(pause).toHaveBeenCalledTimes(1);
    expect(input.rawModes).toEqual([]);
  });

  test.each([
    ['y', true],
    ['Y', true],
    ['n', false],
    ['N', false],
  ])('stdinから復号した%sで確定する', async (character, expected) => {
    const input = createInput(false),
      { confirmation } = confirmWith(input);

    input.write(character);

    expect(await confirmation).toBe(expected);
  });

  test('非TTYではstdinから復号したEnterで確定する', async () => {
    const input = createInput(false),
      { confirmation } = confirmWith(input);

    input.write('\r');

    expect(await confirmation).toBe(true);
  });

  test('TTYでは確認中だけraw modeを有効にし、確定後に元へ戻す', async () => {
    const input = createInput(true),
      { confirmation } = confirmWith(input);

    expect(input.isRaw).toBe(true);

    input.write('\u001B[B');
    input.write('\r');

    expect(await confirmation).toBe(false);
    expect(input.rawModes).toEqual([true, false]);
    expect(input.readableFlowing).toBe(false);
  });

  test('TTYでstdinが終端してもraw modeを元へ戻す', async () => {
    const input = createInput(true),
      { confirmation } = confirmWith(input);

    input.end();

    expect(await confirmation).toBe(false);
    expect(input.rawModes).toEqual([true, false]);
  });

  test('中断シグナルで確認を打ち切る', async () => {
    const controller = new AbortController(),
      input = createInput(false),
      { confirmation } = confirmWith(input, controller.signal);

    controller.abort();

    expect(await confirmation).toBe(false);
    expect(input.readableFlowing).toBe(false);
  });

  test('中断済みのシグナルでは入力を待たない', async () => {
    const controller = new AbortController();

    controller.abort();

    expect(await confirmWith(createInput(false), controller.signal).confirmation).toBe(false);
  });
});
