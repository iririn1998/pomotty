import { createDiagnosticWriter } from '#src/diagnostics/writer.ts';
import { createSoundPlayer } from '#src/notification/sound.ts';
import { escapeDiagnostic } from '#src/diagnostics/escape.ts';
import process from 'node:process';
import { resolvePlayerCommands } from '#src/platform/commands.ts';
import { runCli } from '#src/cli/run.ts';

const FAILURE_EXIT_CODE = 1,
  /**
   * 同梱音源のディレクトリです。
   *
   * `src/cli.ts`と`dist/cli.js`はどちらもパッケージ直下から1階層下にあるため、
   * 開発時とバンドル後の両方で同じ相対URLが`assets/`を指します。
   */
  SOUND_DIRECTORY = new URL('../assets/', import.meta.url),
  UNCONVERTIBLE_VALUE_MESSAGE = 'Unable to convert the thrown value to a string',
  /** 例外値を、`toString()`が再度例外を投げても失敗せずに文字列化します。 */
  stringifyError = (error: unknown): string => {
    try {
      return String(error);
    } catch {
      return UNCONVERTIBLE_VALUE_MESSAGE;
    }
  },
  /**
   * 未処理エラーを1行の診断として表示し、終了コードを失敗に設定します。
   *
   * 例外メッセージにはユーザー由来の値が含まれ得るため、制御文字などを
   * エスケープしてから出力します。stderrが閉じていても例外を投げません。
   */
  handleFailure = (error: unknown): void => {
    process.exitCode = FAILURE_EXIT_CODE;
    createDiagnosticWriter()(`Error: ${escapeDiagnostic(stringifyError(error))}\n`);
  };

try {
  process.exitCode = await runCli({
    createSoundPlayer: () =>
      createSoundPlayer({ commands: resolvePlayerCommands(), soundDirectory: SOUND_DIRECTORY }),
  });
} catch (error) {
  handleFailure(error);
}
