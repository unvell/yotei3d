// vite.config.js

import { defineConfig } from 'vite';
import string from 'vite-plugin-string';
import path from 'path';
import tailwindcss from '@tailwindcss/vite'
import vue from '@vitejs/plugin-vue'
import { globSync } from 'glob'

const isExampleSite = process.env.BUILD_EXAMPLES_SITE === 'true';

// HTMLファイルを自動的に取得
const htmlInputs = {};
globSync('examples/*.html').forEach(file => {
  const name = path.basename(file, '.html');
  htmlInputs[name] = path.resolve(__dirname, file);
});

export default defineConfig({
  root: isExampleSite ? 'examples' : 'examples',

  build: isExampleSite ?
  {
    // examples site
    outDir: '../examples-dist',
    emptyOutDir: true,
    rollupOptions: {
      input: htmlInputs, // ← 自動的に取得したHTMLファイル群を指定
    },
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