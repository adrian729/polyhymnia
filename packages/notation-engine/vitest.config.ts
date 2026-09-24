import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const modelSrc = fileURLToPath(new URL('../notation-model/src/', import.meta.url));

export default defineConfig({
  resolve: {
    alias: [
      { find: /^@polyhymnia\/notation-model$/, replacement: `${modelSrc}index.ts` },
    ],
  },
});
