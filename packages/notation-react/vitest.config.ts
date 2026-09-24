import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const packages = fileURLToPath(new URL('../', import.meta.url));

export default defineConfig({
  resolve: {
    alias: [
      {
        find: /^@polyhymnia\/notation-model\/build$/,
        replacement: `${packages}notation-model/src/build/index.ts`,
      },
      { find: /^@polyhymnia\/notation-model$/, replacement: `${packages}notation-model/src/index.ts` },
      { find: /^@polyhymnia\/notation-engine$/, replacement: `${packages}notation-engine/src/index.ts` },
    ],
  },
  test: {
    // The rendering test tier (roadmap.md): the real component in a real DOM.
    environment: 'jsdom',
    include: ['test/**/*.test.tsx', 'test/**/*.test.ts'],
  },
});
