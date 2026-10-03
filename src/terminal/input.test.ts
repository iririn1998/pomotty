import { confirmWorkStart } from './input.ts';
import type { SelectionKey, SelectionTerminal } from './input.ts';
import { describe, expect, test } from 'vitest';
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
  MENU_WITH_NG_SELECTED = [
    'Start working? (Use ↑/↓ to select, Enter to confirm)',
    '  OK',
    '❯ NG',
  ].join('\n'),
  MENU_WITH_OK_SELECTED = [
    'Start working? (Use ↑/↓ to select, Enter to confirm)',
    '❯ OK',
    '  NG',
  ].join('\n'),
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

test('初期選択のOKをEnterで決定できる', async () => {
  const result = await confirmFor([key('return')]);

  expect(result).toEqual({
    confirmed: true,
    restoreCount: 1,
    writes: [MENU_WITH_OK_SELECTED, '\n'],
  });
});

test('上下キーでNGへ移動してEnterで決定できる', async () => {
  const result = await confirmFor([key('down'), key('return')]);

  expect(result).toEqual({
    confirmed: false,
    restoreCount: 1,
    writes: [MENU_WITH_OK_SELECTED, `${REDRAW_SEQUENCE}${MENU_WITH_NG_SELECTED}`, '\n'],
  });
});

test('選択に使わないキーは無視する', async () => {
  const result = await confirmFor([key('a'), key('return')]);

  expect(result).toEqual({
    confirmed: true,
    restoreCount: 1,
    writes: [MENU_WITH_OK_SELECTED, '\n'],
  });
});

test('Ctrl+Cでは作業を開始せず端末状態を復元する', async () => {
  const result = await confirmFor([key('c', true)]);

  expect(result).toEqual({
    confirmed: false,
    restoreCount: 1,
    writes: [MENU_WITH_OK_SELECTED, '\n'],
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
      { confirmation, writes } = confirmWith(input);

    input.end();

    expect(await confirmation).toBe(false);
    expect(writes).toEqual([MENU_WITH_OK_SELECTED, '\n']);
    expect(input.readableFlowing).toBe(false);
    expect(input.rawModes).toEqual([]);
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
