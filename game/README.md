# Carrier Landing — Game App

A Vue 3 + TypeScript application that turns the `landing-p1` / `landing-p2`
examples into a real, accumulating codebase. The inline-`<script>` prototypes are
refactored into reusable classes (carrier, aircraft, ocean, environment, flight
model, chase camera, controls) with a DOM HUD overlay built in Vue.

The 3D itself runs on the **Yotei3D** engine, consumed straight from source
(`../src/js`, via the `@` alias) so the game always tracks the latest engine
features. Assets (carrier glTF, F-2 OBJ, HDRIs, textures) are reused from
`../examples/public` — nothing is duplicated.

## Run

From the **repo root** (deps are already installed there — vue, vite, typescript,
the vue + string plugins, pako):

```bash
yarn game          # dev server at http://localhost:5180
yarn game:build    # production build → game/dist
yarn game:preview  # preview the production build
```

No separate `yarn install` is needed inside `game/`.

## Controls

- **←/→** and **A/D** — yaw
- **↑/↓** — pitch (↑ = push-down/descend, ↓ = pull-up/climb)
- **W/S** — throttle
- **R** — reset to the start of the approach
- **drag** (mouse/touch) — look around the jet (auto-recentres)
- **scroll** — zoom
- On-screen pads work too (left = pitch/yaw, right = throttle)

## Structure

```
src/
  main.ts · App.vue            Vue shell: #canvas-container + HUD overlay
  types/   engine.d.ts         ambient types for the engine ('@', '@/math')
           shims-vue.d.ts
  core/    Game.ts             orchestrator: renderer + scene + frame loop
           telemetry.ts        reactive HUD data contract
  world/   Environment.ts      HDR sky · fog · sun · lens flare
           OceanWorld.ts       Ocean config + follow/wake/contact-foam hooks
           Carrier.ts          glTF load · auto-fit · deck material · cull fix
  aircraft/ FlightModel.ts     pure arcade physics (engine-agnostic, testable)
            Aircraft.ts        F-2 model · skin/materials · afterburner
            tunables.ts        flight constants + start pose (single source)
  camera/  FlightChaseController.ts   behind-the-jet camera (banks/pitches with it)
  input/   controls.ts         shared control struct (keyboard + pads)
           InputController.ts  keyboard → controls
  ui/      Hud.vue             airspeed bar + readouts
           VirtualPads.vue     on-screen pitch/yaw + throttle pads
```

### Design split

- **Physics** (`FlightModel`) is pure: no engine or DOM imports, so it can be unit
  tested and reused. The game drives it each frame and `Aircraft.applyState()`
  renders the result.
- **View** wrappers (`Carrier`, `Aircraft`, `OceanWorld`, `Environment`) own the
  Yotei3D scene objects and the knowledge for setting them up (auto-fit, materials,
  cull-bounds repair, ocean tuning).
- **Camera / Input / UI** are independent layers that talk through small contracts
  (`CameraState`, `Controls`, `Telemetry`).

## Notes

- This shares the repo's toolchain via root scripts rather than carrying its own
  `package.json`, so there's a single dependency source and `yarn game` works with
  no extra install. To split it into a standalone package later, add a
  `game/package.json` with `vue` + the dev deps and an own `vite`/`tsc` setup — the
  `src/` tree is already self-contained.
- See `../LANDING-SPECS.md` for the phased roadmap (P1…P6).
```
