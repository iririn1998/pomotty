import process from 'node:process';
import { runCli } from '@/cli/run.ts';

const FAILURE_EXIT_CODE = 1,
  handleFailure = (error: unknown): void => {
    process.exitCode = FAILURE_EXIT_CODE;
    process.stderr.write(`${String(error)}\n`);
  };

try {
  await runCli();
} catch (error) {
  handleFailure(error);
}
