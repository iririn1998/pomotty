import { CONTROL_C_KEY_NAME, keyFrom } from './input.ts';
import type { SelectionInput } from './input.ts';
import { emitKeypressEvents } from 'node:readline';
import process from 'node:process';

/** タイマー実行中に受け付けるキー操作です。 */
type TimerKey = 'interrupt' | 'quit' | 'skip' | 'toggle-pause';

/** タイマー実行中のキー入力を監視するときの値です。 */
type WatchTimerKeysParameters = {
  /** キー入力を読み取るストリームです。 */
  readonly input?: SelectionInput;

  /** 受け付けたキー操作を受け取る処理です。 */
  readonly onKey: (key: TimerKey) => void;
};

/** Ctrlなしで受け付けるキー名と操作の対応です。Shift（大文字）は区別しません。 */
const PLAIN_KEYS: ReadonlyMap<string, TimerKey> = new Map([
    ['q', 'quit'],
    ['s', 'skip'],
    ['space', 'toggle-pause'],
  ]),
  /**
   * キーイベントをタイマーの操作へ変換します。対応しないキーは`undefined`です。
   *
   * Ctrl+Cは中断、Ctrlなしのspace、`s`、`q`はそれぞれ一時停止・再開、skip、
   * 終了とします。Alt（meta）付きのキー、Ctrl+Sなどその他のキーは無視します。
   */
  timerKeyFrom = (value: unknown): TimerKey | undefined => {
    const key = keyFrom(value),
      meta = typeof value === 'object' && value !== null && Reflect.get(value, 'meta') === true;

    if (meta) {
      return undefined;
    }

    if (key.ctrl) {
      if (key.name === CONTROL_C_KEY_NAME) {
        return 'interrupt';
      }

      return undefined;
    }

    return PLAIN_KEYS.get(key.name);
  },
  /**
   * タイマー実行中のキー入力を監視し、対応するキー操作を`onKey`へ渡します。
   *
   * TTYではraw modeにして、押したキーが画面へ表示されてタイマーの描画を
   * 崩さないようにします。raw modeではCtrl+CがSIGINTとして届かないため、
   * キーイベントとして処理します。それ以外のキーは無視します。
   * 戻り値の処理で監視をやめ、変更したraw modeとflowing状態を元に戻します。
   */
  watchTimerKeys = ({ input = process.stdin, onKey }: WatchTimerKeysParameters): (() => void) => {
    emitKeypressEvents(input);

    const inputWasFlowing = input.readableFlowing === true,
      rawModeWasEnabled = input.isRaw === true,
      supportsRawMode = input.isTTY === true && typeof input.setRawMode === 'function',
      handleKeypress = (_sequence: unknown, value: unknown): void => {
        const key = timerKeyFrom(value);

        if (key !== undefined) {
          onKey(key);
        }
      };
    let stopped = false;

    input.on('keypress', handleKeypress);

    if (supportsRawMode && !rawModeWasEnabled) {
      input.setRawMode?.(true);
    }

    if (!inputWasFlowing) {
      input.resume();
    }

    return () => {
      if (stopped) {
        return;
      }

      stopped = true;
      input.removeListener('keypress', handleKeypress);

      if (supportsRawMode && !rawModeWasEnabled) {
        input.setRawMode?.(false);
      }

      if (!inputWasFlowing) {
        input.pause();
      }
    };
  };

export { timerKeyFrom, watchTimerKeys };
export type { TimerKey, WatchTimerKeysParameters };
