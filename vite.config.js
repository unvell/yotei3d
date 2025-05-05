// vite.config.js

import { defineConfig } from 'vite';
import string from 'vite-plugin-string';
import path from 'path';
import tailwindcss from '@tailwindcss/vite'
import vue from '@vitejs/plugin-vue'

const isExampleSite = process.env.BUILD_EXAMPLES_SITE === 'true';

export default defineConfig({
  root: isExampleSite ? 'examples' : 'examples',

  build: isExampleSite ?
  {
    // examples site
    outDir: '../examples-dist',
    emptyOutDir: true,
    plugins: [
      tailwindcss(),
    ],
  }: {
    // js library
    outDir: '../dist',
    lib: {
      entry: '../src/js/index.js',
      name: 'Yotei3D',
      fileName: 'yotei3d',
      formats: ['es', 'umd']
    },
    rollupOptions: {
      external: ['vue'],
      output: {
        globals: {
          vue: 'Vue'
        }
      }
    }
  },

  resolve: {
    alias: {
      '~': path.resolve(__dirname, './'),
      '@': path.resolve(__dirname, './src/js'),
    }
  },

  plugins: [
    string({
      include: ['**/*.vert', '**/*.frag'],
    }),
    vue(),
    tailwindcss(),
  ]
});