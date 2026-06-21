# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Yotei3D is a lightweight WebGL-based 3D rendering engine for the browser, published as `@unvell/yotei3d` on npm. Pure JavaScript (ES6+), no TypeScript. MIT licensed by UNVELL Inc.

## Build & Dev Commands

```bash
yarn dev              # Start Vite dev server with examples (hot-reload)
yarn build            # Build library → dist/yotei3d.js (ESM) + dist/yotei3d.umd.cjs (UMD)
yarn build-examples   # Build example site → examples-dist/
yarn preview          # Preview production build
```

Package manager is **Yarn 4.9.1** (Berry). No formal test suite exists — validation is done via the examples.

## Architecture

**Entry point:** `src/js/index.js` — re-exports the full public API.

### Core Modules (`src/js/`)

- **`render/`** — Renderer (WebGL context, render loop), composable pipeline nodes for multi-pass rendering (shadows, bloom, SSAO, blur), 2D overlay drawing.
- **`scene/`** — Scene graph with hierarchical transforms. SceneObject base class, built-in Shapes (Cube, Plane, Sphere, etc.), Camera, Material (PBR properties: color, roughness, metallic, emission, textures), Animation system.
- **`webgl/`** — Low-level WebGL primitives: Mesh (vertex/index buffers), Shader compilation, Texture loading, Cubemap, frame buffer management.
- **`shader/`** — JavaScript shader wrappers (standard PBR, shadow map, SSAO, wireframe, panorama, point cloud, solid color). Raw GLSL files live in `src/shader/*.vert` and `src/shader/*.frag`.
- **`view/`** — Pluggable camera controllers: ModelViewer (orbit), FPSController, FloorViewController (walk-through), TouchController. Strategy pattern — swap controllers on a renderer.
- **`utility/`** — Resource loading, glTF/OBJ model importers, EventDispatcher (pub/sub), binary archive support, debug panel.
- **`effect/`** — Post-processing image filters.

### Math library (`math/`)

`src/js/math/` is the vendored graphics-math library (Vec2/3/4, Color3/4, Matrix3/4, Ray, BoundingBox3D, Quaternion, MathFunctions) — plain ES6 JS, originally `@jingwood/graphics-math` (github.com/jingwood/js-graphics-math), now maintained in-tree. Import it via the `@/math` alias. Types live in `src/js/math/index.d.ts` (the runtime `.js` is not type-checked; the adjacent `.d.ts` is the source of truth for TS, so e.g. Vec3.x/y/z stay declared as accessors).

### Build Configuration

`vite.config.js` uses a string plugin to import `.vert`/`.frag` shader files as strings. When `BUILD_EXAMPLES_SITE=true`, it builds the examples site (Vue 3 + Tailwind) instead of the library.

### Examples

`examples/` contains HTML pages (helloworld, animation, model loading, panorama, particles, showroom, floor walkthrough, navmesh) that serve as both demos and integration tests. Dev server serves them at root paths (e.g., `/helloworld.html`).
