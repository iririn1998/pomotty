import { defineConfig } from 'tsdown';

export default defineConfig({
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
