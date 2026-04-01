import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: [
      {
        find: '#ink/testing',
        replacement: path.resolve(__dirname, 'src/ink/testing.tsx'),
      },
      {
        find: '#ink',
        replacement: path.resolve(__dirname, 'src/ink/index.ts'),
      },
    ],
    conditions: ['source'],
  },
});
