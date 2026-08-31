import process from 'node:process';
import { runCli } from '@/cli/run.ts';

const FAILURE_EXIT_CODE = 1,
  /** 未処理エラーを表示し、終了コードを失敗に設定します。 */
  handleFailure = (error: unknown): void => {
    process.exitCode = FAILURE_EXIT_CODE;
    process.stderr.write(`${String(error)}\n`);
  };

try {
  await runCli();
} catch (error) {
  handleFailure(error);
}
