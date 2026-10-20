import { describe, expect, test, vi } from 'vitest';
import { PassThrough } from 'node:stream';
import { setImmediate as waitForIo } from 'node:timers/promises';
import { timerKeyFrom, watchTimerKeys } from './timer-keys.ts';

type FakeInput = PassThrough & {
  readonly isRaw: boolean;
  readonly rawModes: readonly boolean[];
  readonly setRawMode: (mode: boolean) => PassThrough;
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

describe('キー操作の判定', () => {
  test.each([
    { expected: 'interrupt', key: { ctrl: true, name: 'c' } },
    { expected: 'toggle-pause', key: { name: 'space' } },
    { expected: 'skip', key: { name: 's' } },
    { expected: 'skip', key: { name: 's', shift: true } },
    { expected: 'quit', key: { name: 'q' } },
    { expected: 'quit', key: { name: 'q', shift: true } },
    { expected: undefined, key: { ctrl: true, name: 's' } },
    { expected: undefined, key: { meta: true, name: 'q' } },
    { expected: undefined, key: { ctrl: true, meta: true, name: 'c' } },
    { expected: undefined, key: { name: 'f4' } },
    { expected: undefined, key: { ctrl: true, name: 'd' } },
    { expected: undefined, key: undefined },
  ])('$keyは$expectedとして扱う', ({ expected, key }) => {
    expect(timerKeyFrom(key)).toBe(expected);
  });
});

describe('タイマー実行中のキー監視', () => {
  test('復号したキーを順番に操作として渡し、対応しないキーは無視する', async () => {
    const input = createInput(true),
      keys: string[] = [],
      stop = watchTimerKeys({
        input,
        onKey: (key) => {
          keys.push(key);
        },
      });

    // Alt+q、F4（SS3のESC O S）、Enterは操作にしない
    input.write('a\r\u001Bq\u001BOS');
    input.write(' sSq');
    input.write('\u0003');
    await waitForIo();

    expect(keys).toEqual(['toggle-pause', 'skip', 'skip', 'quit', 'interrupt']);
    stop();
  });

  test('TTYでは監視中だけraw modeを有効にし、停止後に元へ戻す', () => {
    const input = createInput(true),
      stop = watchTimerKeys({ input, onKey: vi.fn<() => void>() });

    expect(input.isRaw).toBe(true);
    expect(input.readableFlowing).toBe(true);

    stop();
    stop();

    expect(input.rawModes).toEqual([true, false]);
    expect(input.readableFlowing).toBe(false);
  });

  test('非TTYではraw modeを変更せず、停止後はキーを処理しない', async () => {
    const input = createInput(false),
      onKey = vi.fn<() => void>(),
      stop = watchTimerKeys({ input, onKey });

    stop();
    input.write('\u0003');
    await waitForIo();

    expect(input.rawModes).toEqual([]);
    expect(onKey).not.toHaveBeenCalled();
  });
});

describe('端末の状態の扱い', () => {
  test('既にraw modeの端末ではraw modeを変更しない', () => {
    const input = createInput(true);

    input.setRawMode(true);

    const stop = watchTimerKeys({ input, onKey: vi.fn<() => void>() });

    stop();

    expect(input.rawModes).toEqual([true]);
    expect(input.isRaw).toBe(true);
  });

  test('既にflowing状態の入力は停止後もflowing状態のままにする', () => {
    const input = createInput(false);

    input.resume();

    const pause = vi.spyOn(input, 'pause'),
      stop = watchTimerKeys({ input, onKey: vi.fn<() => void>() });

    stop();

    expect(pause).not.toHaveBeenCalled();
    expect(input.readableFlowing).toBe(true);
  });

  test('setRawModeを持たないTTYでもキーを監視できる', async () => {
    const input = Object.assign(new PassThrough(), { isTTY: true }),
      keys: string[] = [],
      stop = watchTimerKeys({
        input,
        onKey: (key) => {
          keys.push(key);
        },
      });

    input.write('q');
    await waitForIo();
    stop();

    expect(keys).toEqual(['quit']);
  });

  test('停止しても同じ入力の他のkeypressリスナーは残す', async () => {
    const input = createInput(false),
      other = vi.fn<() => void>(),
      stop = watchTimerKeys({ input, onKey: vi.fn<() => void>() });

    input.on('keypress', other);
    stop();
    input.resume();
    input.write('q');
    await waitForIo();

    expect(other).toHaveBeenCalledTimes(1);
  });

  test('非TTYでも監視中はキーを処理する', async () => {
    const input = createInput(false),
      keys: string[] = [],
      stop = watchTimerKeys({
        input,
        onKey: (key) => {
          keys.push(key);
        },
      });

    input.write(' ');
    await waitForIo();
    stop();

    expect(keys).toEqual(['toggle-pause']);
    expect(input.rawModes).toEqual([]);
  });
});
