# Carrier Landing Simulation — Living Spec (LANDING-SPECS.md)

> A staged project built on the **Yotei3D** engine: fly an **F-2 jet fighter** and
> land it on the **USS Dwight D. Eisenhower (CVN-69)** aircraft carrier on the open
> sea. This document is the single source of truth and is **updated every phase**.
>
> **Last updated:** 2026-06-29 — Phase **P1** complete.

---

## 1. Vision

A lightweight but visually convincing carrier-landing sim in the browser:

- Pilot an F-2 on approach to a carrier steaming on a Gerstner-wave ocean.
- Fly the standard "ball" approach: line up on the angled deck, hold glideslope,
  catch an arresting wire, or wave-off / bolter and go around.
- Keep it small/fast (Yotei3D's character) while pushing realism in lighting,
  ocean, and the flight feel.

The work is deliberately **phased** so each step renders and is verifiable on its
own. Reuse the existing F-2 assets/examples (`f2-flight.html`) and the ocean
(`ocean.html`).

---

## 2. Phase roadmap

| Phase | Goal | Status |
|---|---|---|
| **P1** | Render the carrier on the ocean under HDRI; free-fly camera to inspect. | ✅ **Done** |
| **P2** | Add the F-2 in the air; basic flight model (throttle, pitch/roll/yaw), chase camera. Carrier static. | ⬜ Planned |
| **P3** | Approach framing: position the F-2 on a rear approach to the angled deck; HUD (airspeed, altitude, sink rate, lineup); landing-area markings. | ⬜ Planned |
| **P4** | Touchdown + arresting gear: detect deck contact in the wire zone, catch/trap (decelerate), bolter (miss → full power go-around), wave-off. | ⬜ Planned |
| **P5** | Polish: deck crew/lights, meatball (Fresnel lens optical landing system), wake/spray, carrier underway (moving + heading into wind), sound. | ⬜ Planned |
| **P6** | Game loop: scoring (centerline/glideslope/wire #), restart, difficulty (sea state, wind). | ⬜ Planned |

Phases may be split further. Per workspace convention we **commit per completed
unit of work** (都度コミット) and keep this file current.

---

## 3. Current state (P1)

**Scene file:** `examples/landing-p1.html` (served at `/landing-p1.html`).
**Registered** in the examples grid (`examples/components/examples.vue`,
"Carrier Landing — P1").

What P1 does:

- Clear-sky **HDRI** environment (`kloppenheim_06_puresky_4k.hdr`) for backdrop + IBL.
- GPU Gerstner-wave **Ocean** (`followTarget: scene.mainCamera` → endless sea).
- **Fog + skyFog** so the sea fades into the horizon with no hard seam.
- **Sun** key light + **LensFlare** bound to `scene.sun`.
- Loads the **carrier glTF** and **auto-fits** it (see §5), sitting it on the water.
- **TouchController** free-fly camera (WASD fly, drag look, wheel dolly).
- Live HUD readout of the fitted deck dimensions.

Verified in-browser (Playwright): hull number **"69"**, island/mast, angled flight
deck, and deck markings all render; ship floats correctly with deck up.

---

## 4. Assets

### Carrier model
- **Source folder copied in:** `examples/public/models/carrier/`
  (`scene.gltf`, `scene.bin`, `textures/Material_baseColor.png`,
  `textures/Material_1_baseColor.png`, `license.txt`).
- Originally downloaded to
  `C:\Users\dujid\Downloads\uss_dwight_d.eisenhower_cvn-69_aircraft_carrier`.
- **glTF 2.0**, 2 meshes, 4 nodes, 2 PBR materials (baseColor only), ~508 KB bin.
- **License: CC-BY-4.0** — *"USS Dwight D. Eisenhower CVN-69 Aircraft Carrier" by
  Muhamad Mirza Arrafi* (Sketchfab). **Attribution is required** wherever shared;
  the credit is shown on-page in `landing-p1.html` and in `license.txt`.

### F-2 jet (already in repo, for P2+)
- `examples/public/models/F2/F2.obj` + `skin1.jpg`. Loaded via
  `scene.createObjectFromObjFormat(...)`. See `examples/f2-flight.html` for a full
  reference: afterburner (emissive blobs + Fire particles + point light), wingtip
  vapor (Smoke), nav lights, canopy glass, HUD glow, and the A/D/W/S/←/→ controls.

### Other assets used
- HDRI: `examples/public/textures/hdr/kloppenheim_06_puresky_4k.hdr`.
- (P5) Jet/ocean/gull audio under `examples/public/audio/` (see ocean/f2 examples).

---

## 5. Carrier auto-fit (important reusable knowledge)

The model arrives **standing on its stern** — its long (fore/aft) axis is the glTF
**+Y**, and raw bounds are huge in Y. The fit pipeline in `landing-p1.html`:

1. **Reorient** with `root.angle = ORIENT = [-90, 0, 0]` → deck faces **+Y (up)**,
   hull length lies along **+Z**. (Verified visually + by the numbers below.)
2. **Measure** `root.getBounds()` *after* setting the angle but *before* any other
   `getBounds` call (first call → no stale child `_cachedBbox`).
3. **Scale** so the longest horizontal axis = `DECK_LENGTH` (engine units).
4. **Recenter** analytically (no re-measure): with the engine's translate·rotate·scale
   order, `world = T + scale · boundsPoint`, so
   `T = (-s·cx, -s·min.y − DRAFT, -s·cz)` puts the ship centered on the origin in
   X/Z with the keel `DRAFT` below the waterline (y=0).

**Measured fit (for reuse):**
- Raw oriented size: **293.9 × 241.8 × 1061.8** (x,y,z) — length along Z.
- `DECK_LENGTH = 230` → **scale ≈ 0.2166**.
- World size: **deck ≈ 230 (L) × 63.7 (W) × 52.4 (H)** units. `DRAFT = 6`.

**Scale rationale:** the F-2 obj is ~10 units long; a real Eisenhower deck (~333 m)
is ~21× a real F-2 (~15.5 m). `DECK_LENGTH = 230` keeps the jet-to-ship ratio
realistic for P2+.

**Scene graph:** `scene → holder (empty pivot at origin) → carrier root (ORIENT +
scale + offset baked in)`. The `holder` stays clean at the origin so later phases
can move/turn the whole ship (carrier underway) via the holder.

`window` handles exposed for debugging: `_scene`, `_ocean`, `carrier`,
`_carrierHolder`, `carrierFit`, `_controller`, `_lensFlare`.

---

## 6. Engine APIs used / learned

- **glTF loading:** `scene.createObjectFromURL("/models/carrier/scene.gltf", cb)`
  → routes to `GLTFLoader`. Resolves `scene.bin` and `textures/*.png` **relative to
  the .gltf URL's basePath**, so copying the whole folder under
  `examples/public/models/` "just works".
- **OBJ loading (F-2):** `scene.createObjectFromObjFormat(url, cb, options)`.
- **Bounds:** `obj.getBounds()` → world-space `BoundingBox3D { min, max, origin, size }`.
  Result is cached in `_cachedBbox` (per object). Changing a parent transform makes
  child caches stale → either measure once up front or clear caches recursively.
- **Controllers:** `TouchController` = free-fly camera (mutates `mainCamera`).
  `ObjectViewController` = spins the *target object* (camera fixed); zoom uses
  `viewer.originDistance` (× 10 = camera dolly distance, clamped ≤ 50 → ≤ 500 u).
- **Ocean / sky / fog:** see `examples/ocean.html` — `Ocean`, `HDRSkyBox`,
  `scene.fog`, `scene.skyFog`, `scene.sun`, `LensFlare`.
- **Static dir:** examples are served from `examples/` with `examples/public/` as
  the web root (so `/models/...`, `/textures/...`, `/img/...`).

---

## 7. Open questions / decisions for later phases

- **Ship heading:** P1 leaves the hull along Z with no yaw. P2/P3 should set the
  ship's heading (and later, motion into the wind) and define the approach axis off
  the **angled** deck (not the centerline) — measure the angled-deck bearing from
  the model.
- **Wire zone & touchdown:** need deck-surface height (top of deck ≈ keel + ~deck
  height; compute precisely from bounds/sampling) and a 2D landing box for the 3–4
  arresting wires.
- **Flight model fidelity:** start arcade (the `f2-flight.html` easing model), move
  toward a basic angle-of-attack/sink-rate model for a believable trap.
- **Performance:** ocean `segments` and `resolutionRatio` are the main knobs.

---

## 8. Changelog

- **2026-06-29 — P1:** Copied carrier glTF into `examples/public/models/carrier/`.
  Created `examples/landing-p1.html` (HDRI + ocean + auto-fit carrier + free-fly
  camera). Added auto-fit/reorient pipeline (ORIENT `[-90,0,0]`, `DECK_LENGTH 230`).
  Registered the example + thumbnail. Verified in-browser. Created this spec.
