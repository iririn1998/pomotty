import { fileURLToPath } from 'node:url';

const config = {
  input: 'src/cli.ts',
  output: {
    banner: '#!/usr/bin/env node',
    file: 'dist/cli.js',
    format: 'esm',
  },
  platform: 'node',
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('src', import.meta.url)),
    },
  },
};

export default config;
