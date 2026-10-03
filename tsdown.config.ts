import { defineConfig } from 'tsdown';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  alias: {
    '@': fileURLToPath(new URL('src', import.meta.url)),
  },
  banner: '#!/usr/bin/env node',
  clean: true,
  dts: false,
  entry: ['src/cli.ts'],
  fixedExtension: false,
  format: ['esm'],
  hash: false,
  outDir: 'dist',
  platform: 'node',
  sourcemap: false,
  target: 'node22',
});
