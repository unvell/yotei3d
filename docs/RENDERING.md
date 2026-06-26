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
- **Environment (IBL):** diffuse irradiance map + prefiltered specular env + analytic
  env-BRDF LUT (`envBRDFApprox`) — the existing split-sum implementation is the
  canonical and only path.

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

1. **Camera-owned output.** Add `camera.exposure` / `toneMapping` / `bloom` /
   `renderScale`; route Stage C from the camera; delete `scene.exposure` &
   `renderingImage.exposure`; remove `panorama.frag` private exposure.
2. **Single lighting path.** Make IBL unconditional in `standard.frag`; delete the
   legacy branch; unify probe + IBL into one indirect-diffuse term; inverse-square
   point falloff.
3. **Colour space.** Linearise sRGB albedo/emissive on read; document linear authoring.
4. **Environment & sun.** Move IBL intensity/tint onto the skybox/environment;
   `sun.direction`-only; delete `sun.location`.
5. **Migrate scenes** (floor-walkthrough, pbr, model, …) to the new axis and verify.
