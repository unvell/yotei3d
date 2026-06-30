# Carrier Landing Simulation — Living Spec (LANDING-SPECS.md)

> A staged project built on the **Yotei3D** engine: fly an **F-2 jet fighter** and
> land it on the **USS Dwight D. Eisenhower (CVN-69)** aircraft carrier on the open
> sea. This document is the single source of truth and is **updated every phase**.
>
> **Last updated:** 2026-06-30 — Phase **P2** in place: the F-2 flies a controllable
> arcade approach toward the carrier (keyboard + on-screen pads, stall model, chase
> cam, airspeed bar). P1 carrier steams under way with a wake.

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
| **P2.1** | Simplify to a landable set (yaw + throttle, pitch optional) and actually put it down on the deck. | ◑ Next |
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

**Next (P2.1):** detect deck touchdown and actually land — reduce to yaw + throttle,
add a glideslope/lineup aid, and a simple trap (or at least a "landed" state).

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
- **Wire zone & touchdown:** need deck-surface height (top of deck ≈ keel + ~deck
  height; compute precisely from bounds/sampling) and a 2D landing box for the 3–4
  arresting wires.
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
