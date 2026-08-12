import { OPTIONS } from '@/constants/options.ts';
import { createCliOutput } from '@/cli/create-output.ts';
import process from 'node:process';

const output = createCliOutput({ options: OPTIONS });

process.stdout.write(output);
