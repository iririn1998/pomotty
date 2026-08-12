import { confirmWorkStart } from './confirm-start.ts';
import type { SelectionKey, SelectionTerminal } from './confirm-start.ts';
import { expect, test } from 'vitest';

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
