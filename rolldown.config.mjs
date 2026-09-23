import { fileURLToPath } from 'node:url';

const config = {
  input: 'src/cli.ts',
  output: {
    // Keep the same directory depth as src/notification/sound.ts for asset URLs.
    file: 'dist/bin/pomotty.js',
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
