// game/vite.config.ts
//
// Dev/build config for the Carrier Landing game app. It is intentionally a
// *separate* Vite root from the engine + examples site so the game can grow on
// its own, while still consuming the Yotei3D engine straight from source.
//
//   • root            → this folder (game/), so /index.html + /src/* are served here
//   • publicDir       → ../examples/public, so the carrier glTF, F-2 OBJ, HDRIs and
//                       textures are reused as-is (no asset duplication)
//   • alias '@'       → ../src/js, matching the engine's own internal '@/...' imports
//                       AND letting game code import from '@' / '@/math' like the
//                       examples do. (The engine source uses '@/...' in 60+ files, so
//                       this alias is mandatory for bundling it from source.)
//   • vite-plugin-string loads the engine's raw *.vert / *.frag shaders as strings.
//
// Run from the repo root:  yarn game   (deps are already installed there)

import { defineConfig } from 'vite';
import path from 'path';
import vue from '@vitejs/plugin-vue';
import string from 'vite-plugin-string';

export default defineConfig({
  root: __dirname,
  publicDir: path.resolve(__dirname, '../examples/public'),

  resolve: {
    alias: {
      // engine source root — used both by the engine's own '@/...' imports and by
      // game code (`import { Renderer } from '@'`, `import { Vec3 } from '@/math'`).
      '@': path.resolve(__dirname, '../src/js'),
    },
  },

  plugins: [
    vue(),
    string({ include: ['**/*.vert', '**/*.frag'] }),
  ],

  server: {
    port: 5180,
    fs: {
      // allow importing the engine source which lives outside this Vite root
      allow: [path.resolve(__dirname, '..')],
    },
  },

  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
