import { OPTIONS } from '@/constants/options.ts';
import { createCliOutput } from '@/cli/create-output.ts';
import process from 'node:process';

type WriteOutput = (output: string) => void;

const runCli = (
  writeOutput: WriteOutput = (output) => {
    process.stdout.write(output);
  },
): void => {
  writeOutput(createCliOutput({ options: OPTIONS }));
};

export { runCli };
