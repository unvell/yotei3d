// vite.config.js

import { defineConfig } from 'vite';
import string from 'vite-plugin-string';
import path from 'path';
import tailwindcss from '@tailwindcss/vite'
import vue from '@vitejs/plugin-vue'
import fs from 'fs';

const isLib = process.env.BUILD_LIB === 'true';

export default defineConfig({
  root: isLib ? '.' : 'examples',

  build: isLib ? {
    outDir: 'dist',
    lib: {
      entry: 'src/js/index.js',
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
  } : {
    outDir: '../site-dist',
    emptyOutDir: true
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
  ]
});