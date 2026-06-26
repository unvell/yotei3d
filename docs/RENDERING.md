# Yotei3D Rendering Axis

The single source of truth for how a pixel's final colour is produced. Every
shader, pipeline node, and scene/camera parameter must conform to this document.
When a new feature needs something this document does not cover, **update this
document first**, then implement. Patch-style additions that bypass this axis are
how the pipeline drifted (three exposure inputs, two ambient models); they are
not allowed.

Status: agreed 2026-06-26. Back-compat is explicitly NOT a goal — existing
scenes are migrated to this axis, not preserved.

---

## 1. Invariants (never violate)

1. **Scene-referred vs output-referred separation.**
   - **Lights & scene** decide *how much light exists* (sun, IBL/environment, GI, emission).
   - **Camera** decides *how the scene is viewed* (exposure, tone-mapping, bloom).
   - A camera change must NEVER alter scene radiance; a light change must NEVER
     depend on the camera. (Two cameras viewing one scene must agree on the
     physical lighting and differ only in exposure/post.)

2. **Linear, HDR, until the very end.** All lighting math is in linear space and
   unbounded (HDR). The ONLY linear→display (tone-map + sRGB encode) happens once,
   at the end of the 2D post stage. No shader applies gamma or tone-map before that.

3. **One BRDF for all light.** Direct lights and IBL specular use the same
   microfacet model. There is exactly one lighting path — there is no "non-IBL"
   fallback path.

4. **One input per concept.** Exactly one exposure input, one indirect-diffuse
   intensity, one bloom intensity, etc. Dead/duplicate knobs are deleted.

---

## 2. The rendering equation

### Stage A — Scene radiance `L` (per fragment, linear, HDR)

```
L = Emission
  + Σ_lights  f_r(l,v,n) · L_light · (n·l) · shadow(l)      // direct: sun + point lights
  + IndirectDiffuse  · AO                                    // indirect diffuse (GI / IBL irradiance)
  + IndirectSpecular · AO                                    // indirect specular (IBL)
```

Shared microfacet BRDF (Cook-Torrance specular + Lambert diffuse):

```
f_r = kD · albedo/π  +  (D · G · F) / (4 (n·l)(n·v))
F   = Fresnel-Schlick(F0, v·h)        F0 = mix(0.04, albedo, metallic)
kD  = (1 - F) · (1 - metallic)        // metals have no diffuse
D   = GGX(roughness)                  G = Smith-Schlick(roughness)
```

Indirect terms (split-sum IBL + probe GI), driven by the **same** `F`:

```
IndirectSpecular = prefilteredEnv(reflect(v,n), roughness) · (F0 · lut.x + lut.y)
IndirectDiffuse  = kD · albedo · E_indirect
E_indirect       = probes present at fragment ? probeIrradiance(n) : iblIrradiance(n)
```

> **GI / IBL must not double-count.** Probes are baked *including the skybox*, so a
> probe already contains the environment's diffuse contribution. Therefore the
> indirect *diffuse* is a SINGLE term — probe where probes exist, else IBL
> irradiance — never `IBL_irradiance + probe` added independently. IBL always
> supplies the *specular* term. One environment intensity scales both indirect
> terms; one GI scale lives inside the probe bake.

- **AO** multiplies indirect only (never direct).
- **Emission** is added in linear HDR (so it drives bloom). It is unconditional —
  not gated by lights/shadow.
- **Shadow** attenuates direct light only.

### Stage B — 3D HDR target

Render `L` into an `RGBA16F` target at `output × camera.resolutionRatio`, linear,
unbounded.
**The skybox/background is drawn into this same linear-HDR target** with no
private exposure or tone-map — it is just another emitter of `L`.

### Stage C — 2D post (screen space, single chain)

```
hdr       = sceneHDR
bloom     = blur( brightPass(hdr, bloomThreshold) ) · bloomIntensity   // from linear HDR luminance
composite = hdr + bloom
exposed   = composite · camera.exposure          // the ONE exposure point
mapped    = toneMap(exposed)                      // one operator (current: 1 - exp(-x))
display   = linearToSRGB(mapped)                  // the ONE encode/gamma point
```

Output at native resolution.

---

## 3. Colour-space rules

- **sRGB textures in → linearise on read.** Albedo / emissive colour textures are
  sRGB-encoded; convert `pow(c, 2.2)` (or sampler sRGB decode) before use. (Today
  `standard.frag` skips this — it must be added.)
- Data textures (normal, roughness, metallic, AO, depth) are **linear**, sampled raw.
- Scalar/colour material params (`color`, `emissiveColor`, light colours) are
  authored in **linear**. (Document this for content authors.)
- Cubemaps used as IBL are linear-HDR; if loaded from LDR sRGB faces, linearise on bake.
- Display encode (`linearToSRGB`) happens once, Stage C only.

---

## 4. Parameter ownership

Camera owns the *view/output*; scene & lights own the *physical light*.

| Parameter | Owner (new) | Replaces (deleted) |
|---|---|---|
| `camera.exposure` | **Camera** | `scene.exposure`, `renderingImage.exposure` (dead), in-shader `exposure` |
| `camera.toneMapping` (operator) | **Camera** | implicit `toneMap` flag / `screen.frag` constant |
| `camera.bloom = { intensity, threshold }` | **Camera** | `bloomEffect.intensity/threshold`, dead `bloomEffect.gamma` |
| `camera.resolutionRatio` (3D render scale, e.g. 0.5 for cheap validation) | **Camera** | `renderingImage.resolutionRatio` |
| `camera.gamma` (display encode) | **Camera** | `renderingImage.gamma` |
| environment IBL **intensity / tint** | **Environment (skybox)** e.g. `skybox.intensity`, `skybox.tint` | `scene.iblIntensity`, `scene.iblColor` |
| GI strength | **Scene / probe bake** `scene.giIntensity` | `scene.probeIntensity` |
| `sun.direction` (unit vector toward sun) | **Sun (light)** | `sun.location` (deleted entirely) |
| `sun.color`, `sun.intensity` | **Sun (light)** | `sun.mat.color` ad-hoc |

Rationale for the one judgement call: **IBL intensity is "how much light exists",
so it is a light/environment property, not the camera.** Putting it on the camera
would make two cameras disagree on scene brightness (Invariant 1).

---

## 5. Lighting specifics

- **Point/area light falloff:** physically-based inverse-square
  `attenuation = 1 / (1 + d²)` (or `clamp` with a range). The legacy exponential
  `exp(-d)` falloff is deleted.
- **Sun:** directional light at infinity. Only `sun.direction` is meaningful.
  Internally stores a normalised direction; no positional `location`.
- **Probes:** L2 SH (9 coeff) as today, baked from the scene incl. skybox; supply
  indirect diffuse where present (see §2).
- **Environment (`scene.environment`):** the single ambient/IBL source.
  - An **image-based** environment (SkyBox / HDRISkyBox / DynamicSky) is drawn as
    the background and baked into IBL automatically (diffuse irradiance map +
    prefiltered specular env + analytic env-BRDF LUT `envBRDFApprox`). There is
    no `enableEnvmap` flag — IBL is on whenever an image environment exists.
  - A **`SimpleSky(ambientColor, { background, backgroundImage, intensity })`** is
    the constant-colour environment (a uniform-radiance / degenerate IBL): it
    supplies a constant indirect-diffuse irradiance so a scene without a skybox
    still has ambient fill instead of rendering black, AND it owns the background
    — a flat `background` colour and/or a `backgroundImage`. `scene.environment`
    defaults to a `SimpleSky`.
  - **`scene.environment` is the single entry point.** There is no `scene.skybox`,
    `renderer.backColor`, or `renderer.backgroundImage` in the public API — the
    environment owns ambient/IBL + background. (`backColor`/`backgroundImage`
    constructor options still seed the default SimpleSky for convenience, and an
    internal `options.backColor` mirror feeds the clear + fog-fallback paths.)
  - Indirect diffuse resolves to exactly one source: probes → IBL irradiance →
    SimpleSky ambient (first available wins; never summed).
  - Sky brightness knobs: `camera.exposure` (whole image), `skybox.mat.color`
    (drawn cubemap only), `skybox.intensity` / `.tint` (IBL on objects only).

---

## 6. Deleted by this axis

- `standard.frag` legacy non-IBL branch (flat `0.75 + 0.25·sundot` ambient, `traceLight`,
  legacy refmap glossy/refraction block). IBL path becomes unconditional.
- Independent additive probe term (folded into single indirect diffuse).
- `panorama.frag` private exposure/tone-map (skybox flows through Stage C).
- Dead options: `renderingImage.exposure`, `bloomEffect.gamma`.
- `scene.exposure`, `scene.iblIntensity`, `scene.iblColor`, `scene.probeIntensity`
  as loose scene scalars → relocated per §4.
- `sun.location`.

---

## 7. Out of scope (tracked future themes — NOT this pass)

These are real and agreed, but separate from the lighting axis:

1. **Material owns the shader.** Delete `object.shader = {...}` per-object override;
   shader selection only via `material.shaderName`. (Continues the
   "shader belongs to Material" redesign.)
2. **Draw-order / render-queue.** Explicit ordering for opaque → transparent →
   depth-test-free effects (fire, smoke, overlays). A sortable render queue with
   per-material queue/blend/depth state.

---

## 8. Implementation phases (lighting axis)

1. ✅ **Camera-owned output.** `camera.exposure` / `gamma` / `toneMapping` /
   `bloom` / `resolutionRatio`; Stage C routed from the active camera; deleted
   `scene.exposure` & dead `renderingImage.exposure`. (panorama.frag private
   exposure removal still pending in a later colour-space pass.)
2. ✅ **Single lighting path.** IBL unconditional in `standard.frag`; legacy
   non-IBL branch + `traceLight` deleted; probe/IBL unified into one
   indirect-diffuse term; inverse-square point falloff. Added `scene.environment`
   + `SimpleSky` constant-ambient fallback (no scene renders black); `scene.skybox`
   is now an alias. Removed the `enableEnvmap` flag — IBL is automatic when an
   image environment exists.
3. ✅ **Colour space.** sRGB albedo/material-colour/emissive decoded to linear on
   read; sky decoded LDR-only (HDR panoramas already linear); single linear→sRGB
   display encode (`camera.gamma` = display gamma, default 2.2); filmic ACES
   tonemap replaces the exponential curve; `panorama.frag` private exposure
   removed (skybox through Stage C). The pipeline re-tunes scene brightness, so
   exposures were re-tuned per scene (ongoing art pass with Jingwood).
4. ✅ **Environment & sun.** IBL intensity/tint read from the environment
   (`scene.environment.intensity` / `.tint`, falling back to legacy scene values);
   `sun.direction` is canonical and `sun.intensity` added (0 = no direct sun).
   Removed the `enableLighting` flag — scenes that used `enableLighting:false`
   now set `sun.intensity = 0`. Examples migrated `sun.location.set(...)` →
   `sun.direction = [...]`.
5. TODO **Colour-space pass (Phase 3)** with art review, then migrate/verify all scenes.
