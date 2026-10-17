import { describe, expect, test, vi } from 'vitest';
import { PassThrough } from 'node:stream';
import { setImmediate as waitForIo } from 'node:timers/promises';
import { watchInterruptKey } from './interrupt-key.ts';

type FakeInput = PassThrough & {
  readonly isRaw: boolean;
  readonly rawModes: readonly boolean[];
};

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
};

describe('タイマー実行中のキー監視', () => {
  test('Ctrl+Cで中断処理を呼び出し、それ以外のキーは無視する', async () => {
    const input = createInput(true),
      onInterrupt = vi.fn<() => void>(),
      stop = watchInterruptKey({ input, onInterrupt });

    input.write('q');
    input.write('\r');
    await waitForIo();

    expect(onInterrupt).not.toHaveBeenCalled();

    input.write('\u0003');
    await waitForIo();

    expect(onInterrupt).toHaveBeenCalledTimes(1);
    stop();
  });

  test('TTYでは監視中だけraw modeを有効にし、停止後に元へ戻す', () => {
    const input = createInput(true),
      stop = watchInterruptKey({ input, onInterrupt: vi.fn<() => void>() });

    expect(input.isRaw).toBe(true);
    expect(input.readableFlowing).toBe(true);

    stop();
    stop();

    expect(input.rawModes).toEqual([true, false]);
    expect(input.readableFlowing).toBe(false);
  });

  test('非TTYではraw modeを変更せず、停止後はキーを処理しない', async () => {
    const input = createInput(false),
      onInterrupt = vi.fn<() => void>(),
      stop = watchInterruptKey({ input, onInterrupt });

    stop();
    input.write('\u0003');
    await waitForIo();

    expect(input.rawModes).toEqual([]);
    expect(onInterrupt).not.toHaveBeenCalled();
  });
});
