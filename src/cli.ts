import { playCompletionSound } from '@/notification/sound.ts';
import process from 'node:process';
import { runCli } from '@/cli/run.ts';

const FAILURE_EXIT_CODE = 1,
  /**
   * 同梱音源のディレクトリです。
   *
   * `src/cli.ts`と`dist/cli.js`はどちらもパッケージ直下から1階層下にあるため、
   * 開発時とバンドル後の両方で同じ相対URLが`assets/`を指します。
   */
  SOUND_DIRECTORY = new URL('../assets/', import.meta.url),
  /** 未処理エラーを表示し、終了コードを失敗に設定します。 */
  handleFailure = (error: unknown): void => {
    process.exitCode = FAILURE_EXIT_CODE;
    process.stderr.write(`${String(error)}\n`);
  };

try {
  process.exitCode = await runCli({
    playSound: (phase) => {
      playCompletionSound(phase, { soundDirectory: SOUND_DIRECTORY });
    },
  });
} catch (error) {
  handleFailure(error);
}
