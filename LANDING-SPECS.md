# Carrier Landing Simulation — Living Spec (LANDING-SPECS.md)

> A staged project built on the **Yotei3D** engine: fly an **F-2 jet fighter** and
> land it on the **USS Dwight D. Eisenhower (CVN-69)** aircraft carrier on the open
> sea. This document is the single source of truth and is **updated every phase**.
>
> **Last updated:** 2026-07-01 — Phase **P2.1** in place: the F-2 now **actually lands
> on the deck** — a pure touchdown judge (`game/src/world/LandingZone.ts`) traps a
> good pass (arresting-gear roll to a stop on the deck) or calls a crash (hard/fast/
> banked touchdown, or a ditch clear of the ship), with a green/red HUD banner + a V/S
> readout. Flight model gained a landing phase (`flying`/`arrested`/`crashed`). P2 flew
> a physics-based angle-of-attack approach (keyboard + pads, chase cam, airspeed bar);
> P1 carrier steams under way with a wake. **The prototypes are refactored into a Vue 3
> + TypeScript app under `game/`** — run with `yarn game`. See the changelog tail.

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
| **P2** | Add the F-2 in the air; basic flight model (throttle, pitch/yaw/bank, stall), virtual controls + chase camera. Carrier static. | ✅ **Done** |
| **P2.1** | Actually put it down on the deck: touchdown judge (trap / crash / ditch), arresting-gear stop, landing/crash HUD banner + sink-rate readout. | ✅ **Done** |
| **P3** | Approach framing: **angled-deck wire zone** from Blender markers (done — trap only in the wire zone, "missed the wires" outside it); still TODO: rear approach lined up on the angled bearing, lineup/glideslope aid, per-wire grade. | ◑ In progress |
| **P4** | Touchdown + arresting gear: detect deck contact in the wire zone, catch/trap (decelerate), bolter (miss → full power go-around), wave-off. | ⬜ Planned |
| **P5** | Polish: deck crew/lights, meatball (Fresnel lens optical landing system), wake/spray, carrier underway (moving + heading into wind), sound. | ◑ Sound started |
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
- GPU Gerstner-wave **Ocean**, **grid-snapped follow** of the moving carrier (see §6)
  → endless sea with no "swimming".
- **Fog + skyFog** so the sea fades into the horizon with no hard seam.
- **Sun** key light + **LensFlare** bound to `scene.sun`.
- Loads the **carrier glTF** and **auto-fits** it (see §5), sitting it on the water.
- **Carrier under way:** the `holder` is driven forward along the ship's heading
  (`SHIP_SPEED`, bow = glTF local **−Z**), laying a **wake foam** trail (§6).
- **OrbitController** camera that **follows the ship**: the orbit pivot is shifted
  by the ship's per-frame travel each frame, so the carrier stays centred while the
  user's own orbit / zoom / pan are preserved.
- Live HUD readout of the fitted deck dimensions.

Verified in-browser (Playwright): hull number **"69"**, island/mast, angled flight
deck, and deck markings all render; ship floats deck-up and steams **bow-first**;
the wake streams off the **stern**; the sea stays world-stable while the camera
orbits and while the ship travels (no fast-forward / swimming).

---

## 3b. Current state (P2 — F-2 flight & controls)

**Scene file:** `examples/landing-p2.html` (served at `/landing-p2.html`).
**Registered** in the examples grid as "Carrier Landing — P2".

What P2 does (carrier is **static** here to keep the flight tractable):

- Loads the **F-2** (`/models/F2/F2.obj` + `skin1.jpg`), wiring the paint/nav-lights/
  canopy/HUD materials like `f2-flight.html`, plus a throttle-reactive afterburner.
- The jet **spawns off the starboard quarter** (`START` = `(400, 300, 1550)`, heading
  ≈ 14.5° — ≈1.6 km out, 300 m up, right-rear of the ship) and tracks in on a
  **right-diagonal approach** toward the angled deck (**heading 0 = world −Z**, the way
  the bow points; the small +heading crosses it left onto the deck line).
- **Arcade flight model** (`scene.on("frame")`, real-time `dt`): throttle eases speed
  toward `throttle·MAX_SPEED`; a single **yaw** input steers (a coordinated visual
  bank follows the turn); **pitch** adds climb/dive on top. **Vertical motion is a
  lift-vs-weight model** — lift ∝ speed², so at/above `TRIM_SPEED` level flight holds
  altitude, and below it the lift deficit (`gravSink = SINK_MAX·max(0, 1−(v/TRIM)²)`)
  makes the jet **sink more and more → a gradual, believable descent** (not the old
  level-or-stall switch). **Stall is a smooth ramp** (`stallT` over `STALL_MARGIN`
  below `STALL_SPEED`): control authority fades 1.0→0.3 and the nose droops down by
  `STALL_DROP`, both blended by `stallT`. Key tunables at the top of the file
  (`MAX_SPEED 130`, `TRIM_SPEED 75`, `STALL_SPEED 42`, `STALL_MARGIN 12`, `SINK_MAX 24`,
  `YAW_RATE`, `MAX_PITCH`, …). Fly an approach by **easing the throttle back** so speed
  drops below trim and the jet settles into a gentle sink.
- **Controls** — keyboard: `←/→` **and** `A/D` yaw (identical effect, no longer
  stack) · `↑/↓` pitch (**↑ = push-down/descend**, ↓ = pull-up/climb) · `W/S` throttle
  · `R` reset. On-screen **virtual pads** (pointer + touch): left cross = pitch/yaw,
  right = throttle.
- **Airspeed readout in km/h** (internal speed stays u/s; the SPD field shows
  `speed·3.6`).
- **Flight chase camera** — a dedicated `FlightChaseController` (a `CameraController`
  subclass defined in the example) locked **behind + above the jet that banks AND
  pitches with the airframe** (the horizon rolls in a turn). **Drag** (mouse/touch) to
  look around the jet's flanks; the free-look is **held the whole time the pointer is
  down** (even motionless) and only **eases back behind** ~0.6 s **after you release**.
  Press/release are tracked via scene `mousedown` + `enddrag`/`mouseup` plus raw window
  `pointerup`/`touchend`/`touchcancel` as a fail-safe (a touch tap that never dragged
  emits no scene release event). **Scroll** to zoom (dolly along the back vector,
  18..600 u). It reads live flight state via a `getState()` callback and positions
  `mainCamera` from the renderer's controller `tick()`. Replaces the earlier
  direct-drive chase / orbit cam.
- **Airspeed bar** (bottom-centre): fill = speed, a yellow **stall-boundary marker**
  at `STALL_SPEED/MAX_SPEED`, fill turns **green → amber → red** approaching/below
  stall, with SPD / ALT / THR readout and a blinking STALL warning.
- `window` debug handles: `flight` (`pos`, `reset()`, `state()`, `place(z,y,spd)`),
  `jet`, `carrier`, `_carrierHolder`, `_scene`, `_ocean`.

**Carrier frustum-culling gotcha (important):** the renderer frustum-culls each
object by its cached bounds (`_cachedBbox`). The load-time `getBounds()` we use to
auto-fit caches the **pre-scale** box; leaving that stale (or clearing it to
`undefined`) makes the carrier get **culled from most camera angles** (it vanishes).
Fix in `landing-p2.html`: after scaling/positioning, invalidate the holder subtree's
`_cachedBbox` **and immediately call `carrierHolder.getBounds()`** to repopulate the
correct world bounds. (P1's close follow-cam masks this; P2's roaming chase cam
exposed it.)

**P2.1 done:** deck touchdown is detected and the jet actually lands (trap → arrested
roll to a stop, or crash/ditch), with a HUD banner + sink-rate (V/S) readout. Straight-in
**centreline** approach for now; the **angled-deck** lineup + wire-zone grading move to P3.

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
- **Camera controllers (reworked — see `docs/camera.md`):** the camera is the
  single source of the view transform (no more `renderer.viewer` rig; read input
  from `renderer.input`). Attach one controller per camera via
  `scene.mainCamera.controller = new XxxController(opts)` (assigning auto-detaches
  the previous one). The renderer ticks the active camera's controller each frame.
  - `OrbitController` — orbits the **camera** around a pivot `target`, always
    looking at it (carrier stays centered). Options: `target` (Vec3 / `{x,y,z}`,
    **not** an array), `distance`, `yaw`, `pitch`, `min/maxPitch`,
    `min/maxDistance`, `rotate/zoom/panSpeed`, `inertia`, `enableRotate/Zoom/Pan`.
    Built-in inertia. Non-pinned params are derived from the camera's pose on
    attach, so place the camera first then pin only `target`. **P1 uses this.**
  - `TurntableController` — spins the *object* (camera fixed); zoom dollies.
  - `FlyWalkController` — free walk/fly (WASD + drag-look). `FPSController` — FPS walk.
  - Legacy names `ModelViewer` / `ObjectViewController` / `TouchController` still
    work as deprecated aliases.
- **Ocean / sky / fog:** see `examples/ocean.html` — `Ocean`, `HDRSkyBox`,
  `scene.fog`, `scene.skyFog`, `scene.sun`, `LensFlare`.
  - **Endless-sea follow:** `ocean.options.followTarget = <obj with .location>`.
    Follow the **subject that travels** (the carrier `holder`), **never the camera
    eye** — following an orbiting eye sweeps the surface through the world-locked
    wave field and the waves churn/fast-forward as you look around. The recentre is
    **snapped to a whole grid cell** (`size/segments`) so the vertex lattice always
    lands on the same world phase and the waves never "swim" while the grid slides.
  - **Ship wake foam (new):** `ocean.options.wake = { source, dropDistance, life,
    maxPoints, width, widthGrowth, foamColor, foamIntensity }`. The Ocean grows a
    rolling polyline of recent `source.location` samples; the `water` shader paints
    turbulent white foam along it (per-sample strength fades with age, half-width
    grows toward the tail), broken up by scrolling noise and faded into the fog.
    `maxPoints ≤ 48` (= `WaterShader.WAKE_MAX`, must match `#define WAKE_MAX` in
    `water.frag`). The foam is computed in **world space**, so it stays crisp
    regardless of the (coarse) ocean mesh resolution.
    - `wake.sparkle` (HDR; 0 = off) scatters sharp, fast-twinkling sun glints over
      the foam/spray, biased toward the sun and added HDR-bright so bloom catches
      them. The sparkle field covers **all** foam (wake + contact, below).
  - **Depth-based contact foam (new):** `ocean.options.contactFoam = { enabled,
    distance, color, intensity }` — white water wherever **solid geometry breaks
    the surface** (hull waterline, shoreline, rocks). A *different system* from the
    path-trail wake. The `WaterShader` runs its own scene **depth pre-pass** (the
    `attributemap` linear-depth shader, registered via `renderer.prePasses`) into a
    target sized **1:1 to the main framebuffer** so the water pass can sample it by
    `gl_FragCoord` and hit exact texel centres. The ocean **excludes itself**
    (`castShadow=false`, like the shadow/SSAO passes), so the depth holds only
    solids; the target is cleared to **far/white** so empty sky never foams. The
    fragment unpacks the nearest opaque depth and **unprojects it to a world
    position with the inverse projection·view matrix** (`uInvProjView`), then foams
    where that solid sits less than `distance` world-units *below* the water
    surface (a **vertical** band — stays a thin waterline at any view angle,
    **converges at the bow**, no forward smear). Crucially it uses the *pre-pass*
    depth (32-bit packed, precise), **not** the water fragment's `gl_FragCoord.z`:
    the main depth buffer is 16-bit and with far=6000 is only ~±5u accurate at the
    ship, which smeared foam over the whole submerged hull/props. No per-object
    setup — anything that casts (hull, future terrain) gets a waterline.
- **Static dir:** examples are served from `examples/` with `examples/public/` as
  the web root (so `/models/...`, `/textures/...`, `/img/...`).

---

## 7. Open questions / decisions for later phases

- **Ship heading:** the hull's **bow is glTF local −Z** (the "69" bow number is on
  that end), so `HEADING 0` steams toward world −Z; forward = `(-sin θ, -cos θ)`.
  In P2 the jet uses the same convention and **turns are verified** (yaw to the
  right banks the right wing down + curves right; `jet.angle.set(-pitch, 180+heading,
  roll)` with **`_angleOrder = "YXZ"`** so pitch is about the body's lateral axis —
  the default `XYZ` pitches about world-X, which **inverts nose up/down with heading**;
  see the 2026-06-30 rework note). P3 should define the approach axis off the **angled** deck (not the
  centerline) — measure the angled-deck bearing from the model.
- **Wake / foam fidelity:** there are now two foam systems — the path-trail
  **wake** (`options.wake`) and **depth-based contact foam** (`options.contactFoam`,
  hull waterline / shoreline), with shared sun **sparkle**. Both are **foam only**:
  no geometric bow/stern waves and no Kelvin V arms, and the wake trail has no V.
  Geometric wake displacement would need a finer mesh near the ship (mesh is
  ~100 u/cell) or a displacement decal — future work. The contact-foam depth
  pre-pass is full-res every frame; if cost matters, drop it to half-res (sampling
  is normalized so only sharpness changes) — but then force NEAREST or keep 1:1.
- **Wire zone & touchdown:** the **deck-surface height is measured** (P2.1) —
  `Carrier._measureDeckTop()` ray-casts straight down onto the deck (centreline aft
  samples, median) → deck top ≈ **y 12.4**; the trapped jet pins to it (+ gear).
  The **arresting-wire landing area is now authored in Blender** (P3, see §5b): the
  `landing-runway` quad + `landing-wire-origin` empty give the angled-deck touchdown
  zone (centre ≈ **z +66, x −0.8, bearing 9.55°**, ~68×22 u); a clean trap must land
  in it. Still TODO: the rear **approach** lined up on the angled bearing (the jet
  still flies a straight-in centreline), a lineup/glideslope aid, and per-wire grade.
- **Flight model fidelity:** start arcade (the `f2-flight.html` easing model), move
  toward a basic angle-of-attack/sink-rate model for a believable trap.
- **Performance:** ocean `segments` and `resolutionRatio` are the main knobs.

---

## 8. Changelog

- **2026-06-29 — P1:** Copied carrier glTF into `examples/public/models/carrier/`.
  Created `examples/landing-p1.html` (HDRI + ocean + auto-fit carrier). Added
  auto-fit/reorient pipeline (ORIENT `[-90,0,0]`, `DECK_LENGTH 230`). Registered the
  example + thumbnail. Verified in-browser. Created this spec.
- **2026-06-29 — P1 camera:** Migrated the P1 camera from the old `TouchController`
  free-fly rig to the reworked **`OrbitController`** (`docs/camera.md`) so the
  carrier stays fixed at the centre and the camera orbits around it (pivot
  `target (0,18,0)`). Updated §3/§6 to the new camera model (removed the stale
  `viewer.originDistance` reference).
- **2026-06-29 — ocean follow fix:** Dropped `followTarget: scene.mainCamera` from
  P1 — following the orbiting eye swept the world-space waves under the camera, so
  ripples churned and the swell fast-forwarded on every orbit. World-fixed ocean
  while the ship was static.
- **2026-06-29 — carrier under way + wake (P5 pulled forward):** `Ocean.update()`
  now **snaps the follow to a grid cell** (no swimming while the grid slides) and
  grows a **wake trail**; the `water` shader paints **turbulent foam** along it
  (`uWake[WAKE_MAX=48]`). `landing-p1.html` drives the `holder` forward (bow-first,
  local −Z), follows it with the ocean (not the eye) and the camera (pivot shifted
  by the ship's travel, preserving user orbit/zoom/pan), and configures the wake.
  Verified in-browser. Updated §3/§6/§7.
- **2026-06-29 — wake sparkle + contact foam:** Added `wake.sparkle` (HDR sun
  glints twinkling on the spray) and **depth-based contact foam**
  (`options.contactFoam`) — white water at the hull waterline (and any future
  shoreline) via a scene depth pre-pass the `WaterShader` runs itself (ocean
  excluded; target 1:1 with the main FB; cleared to far so empty sky never foams).
  Wake + contact foam unified so the sparkle covers both. Verified in-browser
  (waterline band wraps the hull bow→stern; wake trails behind; open water clean).
  Updated §6/§7.
- **2026-06-30 — P2 (F-2 flight & controls):** Created `examples/landing-p2.html`:
  F-2 spawns astern of a static carrier and flies an **arcade flight model** (yaw +
  bank-to-turn + pitch + throttle, **stall** below `STALL_SPEED`), driven by
  **keyboard + on-screen virtual pads**, with a smoothed **chase camera**. Found &
  fixed a **frustum-culling gotcha** (stale/missing `_cachedBbox` from the load-time
  fit culls the carrier from most angles → invalidate the holder subtree then
  `getBounds()` to repopulate; see §3b). Registered the example + thumbnail.
- **2026-06-30 — P2 controls tuning:** Keyboard finalised to **`←/→` yaw · `↑/↓`
  pitch (↑ = pull-up/climb) · `A/D` bank · `W/S` throttle · `R` reset** (bank
  direction corrected; Up/Down un-reversed). Added a bottom-centre **airspeed bar**
  with a stall-boundary marker and green→amber→red fill + SPD/ALT/THR readout
  (replaces the top-left text HUD). *Functional verification deferred to the user
  (local browser); changes are code-reviewed, not Playwright-verified.*
- **2026-06-30 — P2 controls rework (per request):** **`←/→` and `A/D` are now the
  same single yaw input** (they no longer stack into a faster turn; a coordinated
  visual bank follows the yaw). **Pitch inverted** to joystick convention — **↑ /
  pad-up = push-down (descend), ↓ / pad-down = pull-up (climb)**; pad labels and help
  text updated to match. **Airspeed readout switched to km/h** (`speed·3.6`; internal
  units stay u/s). **Spawn moved** to `(0, 100, 1120)` — 100 m altitude, 500 m further
  astern than before. *Verification deferred to the user (Playwright unavailable).*
- **2026-06-30 — P2 right-diagonal approach + pitch-axis fix:** **Spawn relocated** to
  the **starboard rear quarter** `(400, 300, 1550)`, heading ≈14.5° (≈1.6 km out, 300 m
  up), so the F-2 flies a **right-diagonal approach** onto the angled deck instead of
  dead astern. **Root-caused the "pitch inverts with heading" bug:** the model's
  rotation used the engine's default `XYZ` Euler order, which applies **pitch about the
  world X axis** — so nose up/down flipped sign depending on whether the jet faced −Z
  or +Z (push-down felt reversed at spawn, correct after a 180° turn). **Fix:** set the
  jet's `_angleOrder = "YXZ"` (yaw → pitch → roll) so pitch happens about the **body's
  lateral axis** and is heading-independent. (No quaternions needed; the engine's
  `_quaternion`/`rotationType:'q'` path stays available for future full-6-DOF work.)
  *Verification deferred to the user (Playwright unavailable).*
- **2026-06-30 — P2 orbit camera follows the jet (per request):** Replaced the
  direct-drive chase camera with an **`OrbitController`** whose **pivot tracks the
  jet** — each frame the target is shifted by the jet's travel (`prevJet` delta), so
  **drag-orbit / scroll-zoom / shift-pan stay live** while the jet remains centred
  (the controller fully owns the camera; no more direct `cam.location`/`lookAt` per
  frame). Initial 3/4 chase-style pose (behind + above: yaw 0, pitch 15, distance 64),
  `rotateSpeed 6` / `zoomSpeed 50` tuned for the ~10 u jet. *Verification deferred to
  the user (Playwright unavailable).*
- **2026-06-30 — P2 dedicated flight chase camera (per request):** Replaced the orbit
  camera with a purpose-built **`FlightChaseController`** (a `CameraController`
  subclass, inline in the example): **locks behind + above the jet and follows its
  full attitude — bank (roll) + pitch** (camera `up` = the jet's body-up so the horizon
  tilts in turns); **scroll-zoom** (dolly 18..600 u); **drag to free-look** around the
  flanks, then **auto-recentres behind** ~0.6 s after release / touch-idle (tracked by
  time since the last `drag` event, so mouse-up and touch-idle share one path). Builds
  the jet's world body frame (N/U/R via yaw→pitch→roll) each frame from a `getState()`
  callback. Racing/flight-game feel. *Verification deferred to the user (Playwright
  unavailable).*
- **2026-06-30 — P2 gradual-descent flight model (per request):** Replaced the binary
  *level-or-stall* vertical model with a **lift-vs-weight** one. Lift ∝ speed²; a new
  **`TRIM_SPEED` (75 u/s)** is the level-flight speed — at/above it `pitch 0` holds
  altitude, below it `gravSink = SINK_MAX·max(0, 1−(v/TRIM)²)` makes the jet **sink
  progressively** (gentle near trim, steeper as it slows) for a believable continuous
  descent. **Stall is now a smooth ramp** (`stallT` over `STALL_MARGIN` below
  `STALL_SPEED`) driving both the authority fade (1.0→0.3) and the nose-drop, blended
  instead of switched; the HUD amber **CAUTION** now follows the whole ramp and the red
  **STALL** triggers at full departure. Added tunables `TRIM_SPEED`, `STALL_MARGIN`,
  `SINK_MAX` (removed `SINK_RATE`). To descend on approach, **ease the throttle back**.
  *Verification deferred to the user (Playwright unavailable).*
- **2026-06-30 — P2 chase-cam recenters on release, not on idle (per request):** The
  free-look used to recenter on *time since the last `drag` event*, so holding the
  button/finger still (without releasing) wrongly snapped the view back. Now it tracks
  an explicit **`_pressed`** flag — set on scene `mousedown` (fires for mouse *and*
  touch), cleared on `enddrag`/`mouseup` **plus** raw window `pointerup`/`touchend`/
  `touchcancel`/`pointercancel` (fail-safe for a touch tap that drags zero pixels and
  emits no scene release event). While `_pressed`, the recenter is suppressed entirely;
  it only eases back ~0.6 s **after the pointer actually lifts**. Window listeners are
  removed in `onDetach`. *Verification deferred to the user (Playwright unavailable).*
- **2026-06-30 — Game app: `game/` (Vue 3 + TypeScript) — P1/P2 inline prototypes
  refactored into a real, accumulating codebase (per request).** The inline-`<script>`
  HTML examples (which had to be copy-pasted to evolve) are now reusable classes under
  `game/src/`, consuming the engine **from source** (`@` → `../src/js`) and reusing
  `../examples/public` assets (no duplication). Split: **`core/Game.ts`** (orchestrator:
  renderer + scene + frame loop, replaces the `window.onload` body), **`aircraft/
  FlightModel.ts`** (the arcade physics, now **pure** — no engine/DOM imports, unit-
  testable), **`aircraft/Aircraft.ts`** (F-2 model + skin + afterburner; `applyState()`
  renders the model from the sim), **`aircraft/tunables.ts`** (flight constants + START
  pose, single source), **`world/{Environment,OceanWorld,Carrier}.ts`** (sky/fog/sun/
  flare; ocean config + wake/contact-foam hooks; carrier auto-fit + deck material +
  cull-bounds repair), **`camera/FlightChaseController.ts`** (the P2 chase cam, extracted
  unchanged), **`input/{controls,InputController}.ts`** (shared `Controls` struct +
  keyboard), and **Vue `ui/{Hud,VirtualPads}.vue`** (the airspeed bar + pads, ported from
  the inline CSS, reading a reactive `Telemetry`). Runs via root scripts (`yarn game`,
  `game:build`, `game:preview`) reusing the repo's existing toolchain — no extra install;
  dev server on **:5180**, `publicDir` → `../examples/public`, `vite-plugin-string` for
  the engine's GLSL. Engine typed for the game via a hand-written ambient `engine.d.ts`
  (subset only). **Verified in-browser (Playwright):** carrier auto-fit reproduces the
  spec numbers (scale 0.2166, deck 230×63.7×52.4), F-2 loads, the flight model integrates
  and the reactive HUD tracks it, the chase cam + render are correct (HDRI sky, reflective
  ocean, jet + afterburner). **Future phases (P2.1 onward) are developed in `game/`, not
  in `landing-p2.html`** (the HTML examples remain as the P1/P2 reference snapshots).
- **2026-06-30 — Physics-based flight model: angle-of-attack point-mass (per request).**
  Replaced the arcade vertical model (pitch directly drove climb and auto-returned to
  level) with a proper **longitudinal point-mass model** in `game/src/aircraft/`. Now the
  **nose attitude θ (`pitch`) and the flight path γ (`gamma`, the direction the jet
  actually moves) are separate**; their difference is the **angle of attack α = θ − γ**.
  Lift comes from α and speed (`L = ½ρV²S·CL(α)`), with a soft post-stall CL falloff;
  drag is `CD0 + k·CL²`; the canonical EoM `V̇ = T·cosα − D − W·sinγ` and
  `γ̇ = (L + T·sinα − W·cosγ)/V` curve the velocity vector and change speed. **Pitch is a
  rate command that leaves a persistent attitude** (hold to rotate, release and it stays —
  no auto-return; push the other way to level). A **fly-by-wire AoA limiter** (F-16/F-2
  style) fades elevator authority near `AOA_LIMIT` so you can't peg the nose into a deep-
  stall mush — an envelope limit, not a return. Trim speed / stall speed / top speed now
  **emerge** from the coefficients (pure helpers in `aero.ts`: `liftCoeff`, `dragCoeff`,
  `trimPitchDeg`, `trimThrottle`, `stallSpeed`); the jet **spawns trimmed** for
  `START.speed`. Stall + HUD warnings are now **AoA-based** (not speed-based); the HUD
  gained an **AoA readout**. Lateral motion (yaw + visual bank) kept simple/coordinated.
  New files `aircraft/aero.ts` + reworked `aircraft/{FlightModel,tunables}.ts`; `core/
  telemetry.ts` + `ui/Hud.vue` carry AoA. **Verified in-browser (Playwright, deterministic
  hand-stepping):** trim holds altitude hands-off (AoA 4.1°, alt 300.0→300.1 / 3 s);
  attitude persists after release (Δpitch 0); pull-up climbs and bleeds speed; the AoA
  limiter caps α ≈ 20° under a 4 s hard pull (was 48°); dive builds speed; stall is
  reachable and **recovers** by lowering the nose + power; approach descent is a controlled
  sink when power is eased. The model is **engine/DOM-free and unit-testable.**
- **2026-07-01 — Flight model retuned to real F-2 / F-16-class speeds (per request).**
  The user understood that idle ≠ stopping (the jet *glides* — correct physics; the speed
  floor is the stall speed) and asked for realistic speeds + the real **nose-high approach**
  done **without adding controls** (no flaps/airbrake keys — see the control-simplicity
  note). Retuned `aircraft/tunables.ts` aero coefficients (`QS 0.00168`, `CL_ALPHA 5`,
  `ALPHA_STALL 15`, `THRUST_MAX 3.7`, `AOA_LIMIT 24`, `HUD_SPEED_SCALE 220`) so the emergent
  envelope is realistic: **stall ≈ 240 km/h, approach ≈ 280 km/h at ~11° nose-up (AoA ~11°,
  ~26 % throttle), level top ≈ 1190 km/h** (at full throttle it climbs unless the nose is
  pushed down — realistic excess-thrust behaviour). The **nose-high approach needs no new
  inputs**: the on-speed technique — *pitch = airspeed/AoA (hold the nose-up attitude),
  throttle = descent rate/glidepath* — already works (slow + high AoA = nose up while
  descending). Verified in-browser (Playwright): stall floor 240 km/h, 280 km/h approach
  trims to 11° nose-up, idle settles into a glide (~318 km/h, descending). **Decided to keep
  controls minimal for now** (throttle + pitch/yaw only); drag devices/flaps deferred until
  the user opts into more inputs.
- **2026-07-01 — Airbrake on negative throttle + stall break (per request).** The user
  found the clean jet glided too far to land at idle (correct physics — a slick jet has a
  long glide; the earlier fix chased this with high induced drag). The user's own idea, and
  the chosen solution: **let the throttle axis run −1..+1 and make the negative half a
  speedbrake — no new key** (just hold `S` past idle). Implemented in
  `aircraft/{FlightModel,tunables}.ts`: thrust `T = max(0, throttle)·THRUST_MAX`; when
  throttle < 0 it stows thrust and adds parasitic drag `AIRBRAKE_CD·|throttle|` to the polar
  (so the brake bites hard when fast, eases when slow — like a real speedbrake). Restored the
  **fast clean jet** (`CD0 0.022`, `K_INDUCED 0.10`, `THRUST_MAX 4.0` → L/D ≈ 10.7, top ≈
  1180 km/h; stall 240 / approach 280 unchanged) and set `AIRBRAKE_CD 0.32` (a big flat-plate
  brake). Also added a **stall break** (`STALL_BREAK`): past `AOA_LIMIT` the nose drops back
  toward the velocity vector (real airframes pitch down at the stall), so holding the stick
  back while the path falls can't produce a runaway deep-stall falling-leaf; below the limit
  attitude still fully persists. HUD throttle readout is now bipolar — shows **`THR nn%`**
  (thrust) or a blue **`BRK nn%`** (speedbrake); top-bar hint notes “S past idle = airbrake”.
  Verified in-browser (Playwright, hand-stepped, descent from 150 m at 280 km/h): **idle
  5.6° / 1474 u / touchdown 273 km/h; full airbrake 10.6° / 769 u / touchdown 239 km/h**
  (half the distance, slower); airbrake + nose-down 24°; the previous 54° falling-leaf now
  caps at ~26° AoA and settles; below-limit attitude still persists (Δpitch 0). Controls
  stay unchanged (W/S only). *(Note: `world/Environment.ts` fog `far` was separately tweaked
  6000 → 2000 by the user; not part of this change.)*
- **2026-07-01 — P2.1 deck touchdown / landing (per request "着艦HitCheck").** The F-2 now
  **actually lands**. New **pure** judge `game/src/world/LandingZone.ts` (`LandingJudge`,
  no engine/DOM — testable) builds a deck box from the fitted carrier (holder at origin:
  deck centre X=0/Z=0, `halfLenZ`/`halfWidX` from `fit.worldSize`, surface = `deckTopY`
  ≈ 6.14) and each frame returns **`trap` / `crash` / `none`**: a touchdown over the deck
  footprint within the landing envelope (sink ≤ 12 u/s, speed ≤ 115 u/s, |roll| ≤ 8°, not
  stalled) **traps**; outside those it **crashes** (hard/fast/banked), and reaching the sea
  clear of the deck is a **ditch**. `FlightModel` gained a **phase** (`flying` | `arrested`
  | `crashed`) + a `sinkRate`: on a trap it switches to an **arresting-gear roll**
  (`ARREST_DECEL 45 u/s²`, pinned to the deck, wings/nose levelling, **halted at the bow
  edge** so a long landing can't slide off the front); a crash freezes the wreck. The
  `Game` builds the judge once the carrier fit resolves and drives the transition; new
  telemetry (`phase`, `sinkRate`, `landingMsg`) feeds `ui/Hud.vue`, which adds a **V/S
  readout** and a centred **green “TRAP! LANDED” / red “CRASH”** banner (grade PERFECT/
  GOOD/FIRM by sink, + “Press R to reset”). **Verified in-browser (Playwright, hand-stepped
  + live):** all 8 judge boundary cases correct; a shallow centreline pass → **LANDED GOOD
  (4.6 u/s, 279 km/h)** stopping on-deck at z≈−33 (within ±115); a long pass halts at the
  bow instead of overrunning; a short pass → **ditch crash**; **R resets** to START and
  clears the banner; carrier renders whole (the close on-deck chase-cam view is just very
  low). **Straight-in centreline** approach only for now — **angled-deck lineup + wire-zone
  grading are P3.** Controls unchanged (W/S throttle, ↑/↓ pitch, ←/→ + A/D yaw, R reset).
- **2026-07-01 — P2.1 deck-height fix: measure the real deck surface.** The trapped jet
  was pinning to `deckTopY ≈ 6.1` (from the old “~0.27 up the hull” **guess**), which is
  near the waterline — so a good landing looked like it stopped **on the sea**. Replaced
  the fraction heuristic with a **ray-cast measurement** (`Carrier._measureDeckTop()`):
  after the fit + bounds repair (world transforms ensured), it casts vertical rays down
  the **centreline aft touchdown zone** (z = 10/30/50/70, avoiding the starboard island)
  via `scene.findObjectsByWorldRay` and takes the median hit → **deck top ≈ y 12.4** (the
  fraction is kept only as a sanity-checked fallback, retuned to 0.39). The jet now rests
  **on the flight deck** (verified in-browser: land → `y = 12.41`, sitting on the deck
  markings). **Where to tune deck height:** `game/src/world/Carrier.ts` — it is now
  auto-measured; `DECK_HEIGHT_FRAC` is the fallback only.
- **2026-07-01 — jet sits on its gear:** trapped-jet resting height = measured deck
  surface **+ `AIRCRAFT_GEAR_HEIGHT` (2.5)** → `deckTopY ≈ 14.9`. One value drives both
  the touchdown-contact threshold and the resting pin. (`game/src/world/Carrier.ts`.)
- **2026-07-02 — P3 start: angled-deck wire zone from Blender markers (per request, to
  raise realism without changing the physics).** The arresting-wire landing area is now
  **authored in Blender** (`examples/public/models/carrier/scene.blend`): a `landing-runway`
  quad aligned to the angled flight deck + a `landing-wire-origin` empty at the centre of
  the 4 wires. `export-landing-markers.py` exports just those two objects to
  `landing-markers.gltf` (no carrier mesh). `Carrier` loads that markers glTF and gives it
  the **same fit transform** as the carrier (`_loadMarkers`), so the markers land exactly
  where authored; it then reads the **wire centre** (world ≈ **x −0.8, z +66.6, y 13.2**),
  the **angled-deck axes** (bearing **9.55°**) and the **runway half-width** (7.07 u) by
  probing the runway's world transform, and hides the quad. `LandingZone` gained an
  **oriented `WireZone`**: a clean **trap now requires touching down in the wire zone**
  (≈ 68 × 22 u on the aft angled deck), a deck touchdown **outside** it is a **“missed the
  wires”** crash, and off-deck is still a ditch (falls back to the old deck box if the
  markers are absent). **This also fixes the abrupt-stop** the user saw: because a trap can
  only happen in the aft wire zone, the arresting rollout (~67 u / 1.75 s) always fits on
  the deck and never hits the bow-edge hard-stop. **Verified in-browser (Playwright):**
  markers place at the predicted spot; the runway overlays the angled deck (top-down); land
  in-zone (z 50–66) → **TRAP GOOD, 67 u / 1.75 s** rollout stopping mid-deck; land forward
  of the wires → **“missed the wires”**; short → **ditch**. Physics/arrest **unchanged**.
  *(Note: the straight-in centreline approach is unchanged; lining the rear approach up on
  the 9.55° angled bearing + a lineup/glideslope aid + per-wire grade remain P3 TODO.)*
- **2026-07-02 — P5 audio (per request).** Added a self-contained Web-Audio system
  `game/src/audio/AudioManager.ts` (no engine/DOM coupling). Clips under
  `examples/public/audio/`: `jet-turbine.mp3` (existing) loops as the engine — gain +
  pitch track throttle/speed; `autopilot-disconnect.mp3` fires ~3 s after control begins
  ("you have control"); `pull-up.mp3` is a GPWS "PULL UP" on **stall** or an **imminent
  hard impact** (sink > 12 u/s & time-to-surface < 1.3 s, with a 3.5 s cooldown; a gentle
  approach does not trip it); `alt-callouts.mp3` holds "fifty…forty…thirty…twenty…ten" in
  one file — **split by silence at load** (Web Audio RMS envelope → 5 segments) and each
  word played as the **height above the deck** passes its mark on a descending approach.
  Browsers block audio until a gesture, so playback is **armed on the first key/tap**
  (`unlock()` resumes the context, starts the engine, schedules the start cue); reset (R)
  re-arms the callouts and re-cues "you have control". **Verified in-browser (Playwright):**
  all four clips decode, the context resumes on the first key and the engine loop spools
  with throttle, the callout file splits into 5, and the triggers fire correctly (callouts
  at 50/40/30/20/10; pull-up on stall and on a fast low sink; **no** false pull-up on a
  normal approach). *(Actual audibility/mix is left to the user — Playwright can't listen.)*
  Attribution: autopilot cue by *freesound_community* (Pixabay); `pull-up` from the user's
  Albatross Squadron assets.
