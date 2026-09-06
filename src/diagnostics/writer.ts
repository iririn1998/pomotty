import process from 'node:process';

/** 診断の出力先として最低限必要なストリームです。 */
type DiagnosticStream = {
  /** 出力先のエラーを受け取るリスナーを登録します。 */
  readonly on: (event: 'error', listener: () => void) => unknown;

  /** 診断を書き込みます。 */
  readonly write: (output: string) => unknown;
};

/** 診断を書き込む処理です。 */
type WriteDiagnostic = (output: string) => void;

/**
 * 診断の出力先が閉じていても失敗しない書き込み処理を生成します。
 *
 * 最初の書き込みより前に`error`リスナーを登録し、閉じたパイプなどで
 * 発生する非同期エラーを未処理の例外にしません。同期例外も握りつぶし、
 * 一度でも書き込みに失敗したら以後の診断を出力しません。
 * これにより出力先の状態が終了コードへ影響しなくなります。
 *
 * @param stream 診断の出力先。
 * @returns 出力先の状態にかかわらず例外を投げない書き込み処理。
 */
const createDiagnosticWriter = (stream: DiagnosticStream = process.stderr): WriteDiagnostic => {
  let unavailable = false;

  stream.on('error', () => {
    unavailable = true;
  });

  return (output) => {
    if (unavailable) {
      return;
    }

    try {
      stream.write(output);
    } catch {
      unavailable = true;
    }
  };
};

export { createDiagnosticWriter };
export type { DiagnosticStream, WriteDiagnostic };
