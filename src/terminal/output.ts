import process from 'node:process';

/** 標準出力として最低限必要なストリームです。 */
type OutputStream = {
  /** 出力先のエラーを受け取るリスナーを登録します。 */
  readonly on: (event: 'error', listener: (error: unknown) => void) => unknown;

  /** 文字列を書き込みます。 */
  readonly write: (output: string) => unknown;
};

/** 標準出力へ文字列を書き込む処理です。 */
type WriteOutput = (output: string) => void;

/** 出力失敗を1回だけ受け取る処理です。 */
type OutputFailureHandler = (error: unknown) => void;

/** 出力先が閉じたパイプであることを示すエラーコードです。 */
const BROKEN_PIPE_CODE = 'EPIPE',
  /** エラーが閉じたパイプへの書き込みによるものか判定します。 */
  isBrokenPipe = (error: unknown): boolean =>
    typeof error === 'object' && error !== null && Reflect.get(error, 'code') === BROKEN_PIPE_CODE,
  /**
   * 出力先の失敗を例外にしない標準出力の書き込み処理を生成します。
   *
   * 最初の書き込みより前に`error`リスナーを登録し、閉じたパイプへの書き込みで
   * 発生する非同期の`error`イベントを未処理の例外にしません。書き込み時の
   * 同期例外も同じ処理へ渡します。最初の失敗だけを`onFailure`へ通知し、
   * それ以降の書き込みは省略します。リスナーはプロセス終了まで維持します。
   *
   * @param onFailure 最初の出力失敗を受け取る処理。
   * @param stream 出力先。
   * @returns 出力先の状態にかかわらず例外を投げない書き込み処理。
   */
  createStandardOutput = (
    onFailure: OutputFailureHandler,
    stream: OutputStream = process.stdout,
  ): WriteOutput => {
    let unavailable = false;

    const fail = (error: unknown): void => {
      if (unavailable) {
        return;
      }

      unavailable = true;
      onFailure(error);
    };

    stream.on('error', fail);

    return (output) => {
      if (unavailable) {
        return;
      }

      try {
        stream.write(output);
      } catch (error) {
        fail(error);
      }
    };
  };

export { createStandardOutput, isBrokenPipe };
export type { OutputFailureHandler, OutputStream, WriteOutput };
