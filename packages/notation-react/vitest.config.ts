import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // The rendering test tier (roadmap.md): the real component in a real DOM.
    environment: 'jsdom',
    include: ['test/**/*.test.tsx', 'test/**/*.test.ts'],
  },
});
