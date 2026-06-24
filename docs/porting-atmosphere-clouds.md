# Feasibility study — porting takram `three-geospatial` Sky & Clouds to Yotei3D

Investigated 2026-06-25. Sources:
- Dynamic Sky: `three-geospatial/packages/atmosphere` (`@takram/three-atmosphere`) — story `storybook/src/atmosphere/Sky.stories.tsx`
- Clouds: `three-geospatial/packages/clouds` (`@takram/three-clouds`) — story `storybook/src/clouds/Clouds.stories.tsx`

## TL;DR

A **literal drop-in port is not viable.** The takram code is TypeScript + Three.js classes, built on the pmndrs `postprocessing` `Effect`/`EffectComposer` model, wrapped in React-Three-Fiber, written in **GLSL 3.00 (`#version 300 es`, WebGL2-only)**, and designed for **planet-scale geospatial (ECEF / WGS84 ellipsoid)** rendering. None of that stack exists in Yotei3D.

What *is* viable and recommended is a **reimplementation guided by takram's shaders and algorithms**, adapted to Yotei3D's pipeline-node + shader-wrapper architecture. The reusable gold is the GLSL math (Bruneton scattering, cloud raymarch/noise); the wrappers are not.

| Feature | Verdict | Rough effort |
| -- | -- | -- |
| **Dynamic Sky — analytic (Hosek-Wilkie / single-scattering)** | Recommended first step. Fits the "lightweight yet realistic" ethos, stays in current GLSL1 path, drives existing IBL. | ~3–5 days |
| **Dynamic Sky — faithful Bruneton port** | Feasible, higher fidelity (night/space/aerial perspective). Needs WebGL2 GLSL3 + 3D-texture support added to the engine. LUTs can be shipped as prebuilt assets (no precompute port needed). | ~1–2 weeks |
| **Volumetric Clouds — engine-native raymarch** | Feasible; reuse takram shaders as reference. Needs 3D-texture support + the new sky for lighting. Build on existing `cloudvolume.js` prepass/raymarch bones. | ~2–3 weeks |
| **Volumetric Clouds — faithful takram port** | Largest lift; pulls in 3D textures, MRT, array textures, temporal reprojection, AND atmosphere LUT coupling + ECEF. | ~3–5 weeks |

## What the sources actually are

### Atmosphere (`@takram/three-atmosphere`) — ~16k LOC, 18 shaders
- **Bruneton "Precomputed Atmospheric Scattering."** Sky is a full-screen quad (`SkyMaterial extends RawShaderMaterial`, GLSL3). `AerialPerspective` is a separate `postprocessing` Effect that fogs scene geometry.
- **Lookup textures (LUTs):** transmittance `256×64` (2D), scattering `256×128×32` (**3D**), irradiance `64×16` (2D), optional Mie + higher-order scattering (**3D**). `RGBA16F`/`RGBA32F`.
  - Generated either at runtime (6 precompute frag shaders + 3D render targets + MRT) **or loaded as prebuilt EXR/binary assets** (`PrecomputedTexturesLoader`, default URL on GitHub Git-LFS). → For a port we can ship the binaries and skip porting the precompute pass.
- **Geospatial coupling:** all math is in ECEF; `Ellipsoid.WGS84` radii are baked into the LUT parameterization; sun/moon via `astronomy-engine` + `updateByDate`. The sun direction *can* be supplied manually (no ephemeris needed); the planet radii must stay (treat WGS84 as an abstract planet — camera sits near the surface).
- **Deps:** `three`, `@takram/three-geospatial` (Ellipsoid/Geodetic, a `#include` shader-chunk system via `resolveIncludes`/`unrollLoops`, EXR/3D texture loaders), `postprocessing` (for AerialPerspective only), R3F (wrappers only).

### Clouds (`@takram/three-clouds`) — ~6.8k LOC, 21 shaders
- **Ray-marched volumetric**, 4-pass pipeline: shadow pass → clouds raymarch pass (**MRT**: color+optical-depth / depth+velocity / shadow-length) → temporal resolve+upscale (history buffer, variance clipping, Catmull-Rom, 1/4-res) → composite Effect.
- **Noise:** shape `128³` + detail `32³` (**3D**, procedurally rendered), 2D local-weather + turbulence, 3D STBN blue noise.
- **WebGL2-only features used:** `sampler3D`/`Data3DTexture`, `WebGL3DRenderTarget`, `sampler2DArray`/`DataArrayTexture` (shadow cascades), `layout(location=N) out` MRT, `texelFetchOffset`.
- **Deep atmosphere coupling:** the cloud lighting samples the atmosphere transmittance/scattering/irradiance LUTs directly (~200+ shader lines). Clouds without atmosphere ⇒ rewrite the lighting model.
- **Scale:** curved-earth/ECEF; story runs camera far = 400 km. A flat-slab adaptation is possible (~50–100 shader lines) but loses altitude-based effects.
- **Cost:** 200–500 primary samples + secondary sun/ground marches; needs temporal upscale to hit 60 fps on mid hardware.

## Yotei3D capabilities & gaps

Have (good foundation):
- WebGL2 context (with WebGL1 fallback); `RGBA16F` 2D textures + cubemaps; float render targets (`EXT_color_buffer_float`); full HDR pipeline + tonemap/bloom.
- Composable **pipeline-node** system (FBO chaining, half-res passes), a `prePasses` array, depth-as-texture via `AttributeRenderer`, and an **IBL baker** (equirect→cubemap + irradiance) feeding PBR IBL.
- Existing volumetrics to build on: billboard `cloud.js`, screen-space god rays `volumetriclight.js`, and **`cloudvolume.js`** — a sun's-eye cloud-shadow-map *pre-pass* + full-screen *raymarch* god-ray on a float RT. The raymarch + prepass + float-RT patterns are already in production here.

Gaps (the enabling refactor):
- **Shaders are GLSL ES 1.00** (no `#version 300 es`), even on a WebGL2 context. The takram shaders are all GLSL3 → cannot be reused as-is.
- **No 3D textures, no 2D array textures, no MRT** wrappers. Required by both the Bruneton scattering LUT and the cloud noise/shadow pipeline.
- No `#include` shader-chunk system (takram leans on one heavily).

## The four hard frictions

1. **GLSL 1.00 vs 3.00.** A faithful port needs the engine to compile **GLSL3** shaders (at least for new sky/cloud materials). The context is already WebGL2, so this is additive, not a rewrite — but it touches the shader-compile path.
2. **Missing WebGL2 texture/target types** (3D, array, MRT). These must be wrapped in `webgl/texture.*` and `webgl/buffers.js`. Well-scoped, moderate effort — exactly the kind of architecture change the dev philosophy welcomes.
3. **Geospatial / ECEF + atmosphere↔clouds coupling.** Decide up front: adopt takram's planet frame, or strip to a local/large-sphere frame. Clouds can't take the faithful path without the atmosphere LUTs.
4. **Framework deps** (`postprocessing` Effect/Composer, R3F, `@takram/three-geospatial`, the `#include` system) have no equivalent — each maps onto Yotei3D's pipeline nodes by manual reimplementation.

## Recommended path (phased)

1. **Sky, analytic first (A2).** Implement a compact analytic sky (Hosek-Wilkie or Preetham, or a small single-scattering raymarch) in the current GLSL1 path; render it into the existing cubemap so it drives **dynamic IBL** (sun moves → reflections/ambient update). Lowest risk, fits "lightweight yet realistic," and is the lighting source clouds will need. *Use takram's `bruneton/*.glsl` as the fidelity benchmark.*
2. **Enabling refactor.** Add GLSL3 + 3D/array-texture + MRT support to the engine (frictions 1–2). Gated behind a quick confirmation per the dev philosophy.
3. **Sky, faithful (A1) — optional upgrade.** If night sky / aerial perspective / spectral accuracy is wanted, port `SkyMaterial` + `bruneton/*.glsl` and **load prebuilt LUT binaries** (skip the precompute shaders). Reuse the IBL baker hook from step 1.
4. **Clouds — engine-native raymarch.** Build a Nubis/Schneider-style 3D-noise raymarch cloud layer lit by the step-1/3 sky, composited against scene depth (`AttributeRenderer`), extending `cloudvolume.js`. Add temporal half-res upscale last. *Use takram's `clouds.frag` + `perlin.glsl`/`tileableNoise.glsl` as reference, not a literal port.*

**Why Sky before Clouds:** clouds depend on a sun+sky lighting model; the sky is lower-risk and independently valuable (dynamic IBL); and both want the same WebGL2 texture refactor.

## Open decisions for the user
- Sky route: **analytic-first (A2)** vs **faithful Bruneton (A1)**.
- Coordinate frame: keep Yotei3D's local/world scene (recommended) vs adopt takram's geospatial/ECEF frame.
- Clouds: defer until after Sky (recommended) vs investigate/prototype in parallel.
- Appetite for the GLSL3 + WebGL2-texture engine refactor (required for any faithful/3D-texture path).
