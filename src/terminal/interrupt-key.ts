import { CONTROL_C_KEY_NAME, keyFrom } from './input.ts';
import type { SelectionInput } from './input.ts';
import { emitKeypressEvents } from 'node:readline';
import process from 'node:process';

/** タイマー実行中のキー入力を監視するときの値です。 */
type WatchInterruptKeyParameters = {
  /** キー入力を読み取るストリームです。 */
  readonly input?: SelectionInput;

  /** Ctrl+Cが押されたときに呼び出す処理です。 */
  readonly onInterrupt: () => void;
};

/**
 * タイマー実行中のキー入力を監視し、Ctrl+Cで`onInterrupt`を呼び出します。
 *
 * TTYではraw modeにして、押したキーが画面へ表示されてタイマーの描画を
 * 崩さないようにします。raw modeではCtrl+CがSIGINTとして届かないため、
 * キーイベントとして処理します。それ以外のキーは無視します。
 * 戻り値の処理で監視をやめ、変更したraw modeとflowing状態を元に戻します。
 */
const watchInterruptKey = ({
  input = process.stdin,
  onInterrupt,
}: WatchInterruptKeyParameters): (() => void) => {
  emitKeypressEvents(input);

  const inputWasFlowing = input.readableFlowing === true,
    rawModeWasEnabled = input.isRaw === true,
    supportsRawMode = input.isTTY === true && typeof input.setRawMode === 'function',
    handleKeypress = (_sequence: unknown, value: unknown): void => {
      const key = keyFrom(value);

      if (key.ctrl && key.name === CONTROL_C_KEY_NAME) {
        onInterrupt();
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

export { watchInterruptKey };
export type { WatchInterruptKeyParameters };
