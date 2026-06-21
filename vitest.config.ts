import { defineConfig } from 'vitest/config';
import string from 'vite-plugin-string';
import path from 'path';

// Standalone test config kept separate from the build config in vite.config.js
// so the library/examples build conditionals don't leak into the test runner.
export default defineConfig({
  plugins: [
    string({ include: ['**/*.vert', '**/*.frag'] }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src/js'),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.{test,spec}.{js,ts}'],
  },
});
