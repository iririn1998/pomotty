import { CONTROL_C_KEY_NAME, confirmWorkStart, createSelectionTerminal, keyFrom } from './input.ts';
import type { SelectionKey, SelectionTerminal } from './input.ts';
import { describe, expect, test, vi } from 'vitest';
import { PassThrough } from 'node:stream';
import process from 'node:process';

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
      pause = vi.spyOn(input, 'pause'),
      { confirmation, writes } = confirmWith(input);

    input.end();

    expect(await confirmation).toBe(false);
    expect(writes).toEqual([MENU_WITH_OK_SELECTED, '\n']);
    // Node.js 26以降は終端済みストリームのpause()でflowing状態が変わらないため、
    // 状態ではなく、アプリが開始したflowingを戻す呼び出しを確認します。
    expect(pause).toHaveBeenCalledTimes(1);
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

describe('キー情報の正規化', () => {
  test.each([
    { expected: { ctrl: true, name: 'c' }, name: 'Ctrl+C', value: { ctrl: true, name: 'c' } },
    { expected: { ctrl: false, name: 'up' }, name: 'Ctrlなし', value: { name: 'up' } },
    { expected: { ctrl: false, name: 'a' }, name: 'trueでないctrl', value: { ctrl: 1, name: 'a' } },
    { expected: { ctrl: false, name: '' }, name: '文字列でない名前', value: { name: 1 } },
    { expected: { ctrl: false, name: '' }, name: 'undefined', value: undefined },
    { expected: { ctrl: false, name: '' }, name: 'null', value: null },
    { expected: { ctrl: false, name: '' }, name: '文字列', value: 'c' },
  ])('$nameを$expectedへ変換する', ({ expected, value }) => {
    expect(keyFrom(value)).toEqual(expected);
  });

  test('Ctrl+Cのキー名はcである', () => {
    expect(CONTROL_C_KEY_NAME).toBe('c');
  });
});

describe('選択操作', () => {
  test('上キーでも選択を切り替える', async () => {
    const result = await confirmFor([key('up'), key('return')]);

    expect(result).toEqual({
      confirmed: false,
      restoreCount: 1,
      writes: [MENU_WITH_OK_SELECTED, `${REDRAW_SEQUENCE}${MENU_WITH_NG_SELECTED}`, '\n'],
    });
  });

  test('2回移動するとOKへ戻る', async () => {
    const result = await confirmFor([key('down'), key('down'), key('return')]);

    expect(result).toEqual({
      confirmed: true,
      restoreCount: 1,
      writes: [
        MENU_WITH_OK_SELECTED,
        `${REDRAW_SEQUENCE}${MENU_WITH_NG_SELECTED}`,
        `${REDRAW_SEQUENCE}${MENU_WITH_OK_SELECTED}`,
        '\n',
      ],
    });
  });

  test('enterという名前のキーでも確定する', async () => {
    const result = await confirmFor([key('enter')]);

    expect(result.confirmed).toBe(true);
  });

  test('NGを選んだ状態でCtrl+Cを押してもfalseを返す', async () => {
    const result = await confirmFor([key('down'), key('c', true)]);

    expect(result.confirmed).toBe(false);
  });

  test('Ctrlなしのcと、Ctrl+C以外のCtrl付きのキーは無視する', async () => {
    const result = await confirmFor([key('c'), key('d', true), key('space'), key('return')]);

    expect(result).toEqual({
      confirmed: true,
      restoreCount: 1,
      writes: [MENU_WITH_OK_SELECTED, '\n'],
    });
  });

  test('キー入力の待機が失敗しても端末状態を復元して失敗を伝える', async () => {
    let restoreCount = 0;
    const failure = new Error('stdin failed');

    await expect(
      confirmWorkStart({
        createTerminal: (): SelectionTerminal => ({
          nextKey: () => Promise.reject(failure),
          restore: () => {
            restoreCount += COUNT_INCREMENT;
            return Promise.resolve();
          },
          write: () => {
            // 出力はこのテストでは確認しません。
          },
        }),
      }),
    ).rejects.toBe(failure);
    expect(restoreCount).toBe(1);
  });

  test('ターミナル操作の作成には入力、シグナル、書き込み処理をそのまま渡す', async () => {
    const controller = new AbortController(),
      input = new PassThrough(),
      write = vi.fn<(output: string) => void>();
    let received: unknown;

    await confirmWorkStart({
      createTerminal: (parameters): SelectionTerminal => {
        received = parameters;

        return {
          nextKey: () => Promise.resolve(key('return')),
          restore: () => Promise.resolve(),
          write: () => {
            // 出力はこのテストでは確認しません。
          },
        };
      },
      input,
      signal: controller.signal,
      write,
    });

    expect(received).toEqual({ input, signal: controller.signal, write });
  });
});

describe('選択画面用のターミナル操作', () => {
  test('既にraw modeの端末ではraw modeを変更しない', async () => {
    const input = createInput(true);

    input.setRawMode(true);

    const { confirmation } = confirmWith(input);

    input.write('\r');

    expect(await confirmation).toBe(true);
    expect(input.rawModes).toEqual([true]);
    expect(input.isRaw).toBe(true);
  });

  test('既にflowing状態の入力は確定後もflowing状態のままにする', async () => {
    const input = createInput(false);

    input.resume();

    const pause = vi.spyOn(input, 'pause'),
      { confirmation } = confirmWith(input);

    input.write('\r');

    expect(await confirmation).toBe(true);
    expect(pause).not.toHaveBeenCalled();
    expect(input.readableFlowing).toBe(true);
  });

  test('setRawModeを持たないTTYではraw modeを使わない', async () => {
    const input = Object.assign(new PassThrough(), { isTTY: true }),
      confirmation = confirmWorkStart({
        input,
        write: () => {
          // 出力はこのテストでは確認しません。
        },
      });

    input.write('\r');

    expect(await confirmation).toBe(true);
  });

  test('restoreを複数回呼んでも状態の復元は1回だけ行う', async () => {
    const input = createInput(true),
      pause = vi.spyOn(input, 'pause'),
      terminal = createSelectionTerminal({ input, write: vi.fn<(output: string) => void>() });

    await terminal.restore();
    await terminal.restore();

    expect(input.rawModes).toEqual([true, false]);
    expect(pause).toHaveBeenCalledTimes(1);
  });

  test('restoreの後はシグナルの中断で何もしない', async () => {
    const controller = new AbortController(),
      input = createInput(false),
      terminal = createSelectionTerminal({ input, signal: controller.signal });

    await terminal.restore();

    expect(() => {
      controller.abort();
    }).not.toThrow();
  });

  test('stdinのcloseでもCtrl+Cとして入力の待機を終える', async () => {
    const input = createInput(false),
      terminal = createSelectionTerminal({ input, write: vi.fn<(output: string) => void>() }),
      next = terminal.nextKey();

    input.destroy();

    expect(await next).toEqual({ ctrl: true, name: 'c' });
    await terminal.restore();
  });

  test('復号したキーを正規化して返す', async () => {
    const input = createInput(true),
      terminal = createSelectionTerminal({ input, write: vi.fn<(output: string) => void>() }),
      next = terminal.nextKey();

    input.write('\u001B[A');

    expect(await next).toEqual({ ctrl: false, name: 'up' });
    await terminal.restore();
  });

  test('書き込み処理を省略した場合は標準出力へ書き込む', async () => {
    const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    try {
      const terminal = createSelectionTerminal({ input: createInput(false) });

      terminal.write('menu');
      await terminal.restore();

      expect(write).toHaveBeenCalledWith('menu');
    } finally {
      write.mockRestore();
    }
  });
});
