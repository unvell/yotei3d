# Yotei3D Camera Control

How the camera is posed and how user input drives it. This is the single source
of truth for camera controllers. See also [RENDERING.md](./RENDERING.md) for the
*output* side of the camera (exposure / tone-map / bloom); this document covers
the *view* side (where the eye is and how it moves).

Status: agreed 2026-06-29. Back-compat for the public class **names** is kept via
deprecated aliases, but the old `viewer` rig is gone — scenes are migrated to the
camera-based model, not preserved.

---

## 1. Background — why this was reworked

Camera posing used to be split across **two independent transform layers** that
the renderer multiplied together:

```
projectionViewMatrix = viewMatrix(viewer) · cameraMatrix(mainCamera) · projection
```

- **Viewer rig** — a single, global `renderer.viewer` holding `angle` (orbit),
  `originDistance` (zoom) and `location` (pan). `ModelViewer` and
  `ObjectViewController` drove this.
- **Camera object** — `scene.mainCamera`, a real `SceneObject` with
  `location` / `angle`. `TouchController` and `FPSController` drove this.

Problems:

1. **No multi-camera.** The rig was global (one per renderer), so any orbit/zoom
   lived outside the camera and could not be expressed per-camera.
2. **`Viewer` did two unrelated jobs** — input event hub *and* a camera transform.
3. **Confusing names.** `TouchController` was actually a free fly/walk camera;
   `ObjectViewController` rotated the *object*, not the camera; there was no real
   orbit-the-camera controller.

The rework removes the rig entirely and makes the **camera the single source of
the view transform**, with one controller attached per camera.

---

## 2. Architecture

### 2.1 Single source of truth
`makeViewMatrix()` is now identity. The eye transform is built solely from
`scene.mainCamera` by `makeCameraMatrix()`. Orthographic zoom, previously
`viewer.originDistance`, now lives on `Camera.orthoSize`.

### 2.2 Input hub: `InputManager`
The old `Viewer` class is now `InputManager` (`src/js/scene/input.ts`), reachable
as **`renderer.input`**. It owns mouse / keyboard / touch state and dispatches
scene events (`drag`, `mousewheel`, `begindrag`, `enddrag`, `mouseup`, …). It has
**no** transform state. `Keys`, `MouseButtons`, `OperationModes`, `Faces` are
exported from this module.

> There is no `renderer.viewer` anymore. Read input from `renderer.input`.

### 2.3 Controller attached to a camera
A controller is attached to a `Camera` (Unity/Babylon style). Assigning it
auto-detaches the previous one:

```ts
camera.controller = new OrbitController({ target: Vec3.zero, distance: 6 });
```

`CameraController` (`src/js/view/cameracontroller.ts`) is the base class:

| Member | Purpose |
|---|---|
| `attach(camera)` / `detach()` | called by `Camera.controller` setter; wire/unwire |
| `update(dt)` | per-frame logic (held-key movement, inertia) |
| `enabled` | gate without detaching |
| `dispose()` | detach + cleanup |
| `tick()` | called by the renderer each frame; computes dt and calls `update` |
| `isActive()` (protected) | true only for the **active** camera (`scene.mainCamera === this.camera`) and `enabled` |
| `bind(event, handler)` (protected) | subscribe to a scene event and auto-remove on `detach` |
| `scene` / `renderer` / `input` (protected getters) | derived from the attached camera |

### 2.4 Render-loop integration
Each animation frame the renderer calls the active camera's controller:

```js
// renderer.render()
if (scene && scene.mainCamera && scene.mainCamera.controller) {
  scene.mainCamera.controller.tick();   // -> update(dt) when active & enabled
}
```

A controller that has motion calls `scene.requireUpdateFrame()` so the frame is
drawn; an idle controller costs only an early-out. This replaces the per-controller
`requestAnimationFrame` / `setInterval` loops the old controllers each ran.

### 2.5 Multi-camera
Each camera carries its own `controller`. Today the renderer ticks the **active**
camera (`mainCamera`). Supporting several cameras rendering at once is a small
extension: tick every camera that has a controller. The per-controller
`isActive()` guard already prevents an inactive camera's controller from reacting
to shared scene input.

---

## 3. The controllers

All live in `src/js/view/`. All accept the new `(options)` form **and** the legacy
`(scene | camera, options)` form (the latter auto-attaches to `scene.mainCamera`).

### OrbitController  (`orbitcontroller.ts`) — replaces `ModelViewer`
True orbit of the **camera** around a pivot `target`. Camera position is
`target + dir(yaw, pitch) · distance`, always looking at `target`.

**Motion model — constant impulse + inertia.** Every interaction (rotate / zoom /
pan) adds a *fixed* amount to a velocity, independent of how fast the pointer
moved; each frame `update(dt)` integrates and damps that velocity, so motion
glides to a smooth stop after release. Damping is frame-rate independent
(`vel *= inertia^(dt·60)`).

On attach it **derives** `yaw` / `pitch` / `distance` from the camera's current
pose (unless pinned via options), so attaching to an already-placed camera never
snaps the view.

Key options / properties: `target`, `distance`, `yaw`, `pitch`, `rotateSpeed`,
`zoomSpeed`, `panSpeed`, `inertia`, `minPitch` / `maxPitch`,
`minDistance` / `maxDistance`, `enableRotate` / `enableZoom` / `enablePan`.
`yaw` / `pitch` / `distance` / `setTarget()` apply immediately when set.

### TurntableController  (`turntablecontroller.ts`) — replaces `ObjectViewController`
Observe one object from any angle by spinning the **object** on a turntable while
the camera stays where you placed it (lighting is fixed, so shading changes as the
object turns). Set `targetObject`. Zoom now **dollies the camera** toward/away
from the object (was the removed rig). Keeps the legacy drag-acceleration inertia.

Key options: `targetObject`, `enableHorizontalRotation`, `enableVerticalRotation`,
`enableScrollToScaleObject`, `minVerticalRotateAngle` / `maxVerticalRotateAngle`,
`enableDragAcceleration`, `dragAccelerationAttenuation` / `dragAccelerationIntensity`,
`minDistance` / `maxDistance`.

### FlyWalkController  (`flywalkcontroller.ts`) — replaces `TouchController`
Free walk + fly: WASD / arrows to move, drag to look, `Shift`+W/S to rise/fall,
wheel to dolly, optional click-to-move. Held-key movement runs in `update()`.

Key options: `speed`, `distance`, `clickToMove`, `dragAccelerationAttenuation`,
`dragAccelerationIntensity`. Optional `oncameramove` callback.

### FPSController  (`fpscontroller.ts`)
First-person walk; WASD + mouse-look, hides the cursor while dragging. Ported to
the base class (movement in `update()` instead of `setInterval`). Option:
`moveSpeed`.

> FPSController and FlyWalkController overlap heavily. A future cleanup may merge
> them into one controller with options (e.g. `lockY`, `clickToMove`).

### FloorViewController  (`floorviewcontroller.ts`)
App-level walkthrough manager (top-down ↔ walk mode toggle, click a point to move
to it). Internally uses a `FlyWalkController` for walk mode and drives the camera
directly for top mode. Top-view drag now rotates the **camera yaw** (the rig spin
is gone).

---

## 4. Usage

### New API (preferred)
```ts
// orbit a model
scene.mainCamera.controller = new OrbitController({ target: model.location, distance: 8 });

// inspect an object on a turntable
const turntable = new TurntableController({ targetObject: model, minDistance: 2 });
scene.mainCamera.controller = turntable;

// free fly/walk
scene.mainCamera.controller = new FlyWalkController({ speed: 0.1 });

// swap controllers at runtime (old one auto-detaches)
scene.mainCamera.controller = new FPSController();
scene.mainCamera.controller = undefined;   // detach, no controller
```

### Legacy API (still works via aliases)
```ts
const c = new ModelViewer(scene);            // -> OrbitController on scene.mainCamera
const o = new ObjectViewController(scene, { targetObject: obj }); // -> TurntableController
const t = new TouchController(scene, { speed: 0.1 });             // -> FlyWalkController
```

### Reading input directly (no controller)
```ts
cube.angle.y += renderer.input.mouse.movement.x;          // was renderer.viewer.mouse...
if (renderer.input.pressedKeys.has(Keys.Up)) { /* ... */ }
```

---

## 5. Migrating the examples

The deprecated aliases keep every example *running*, but we are converting them to
the explicit new API one by one. When you touch an example:

### 5.1 Name / construction
| Old | New |
|---|---|
| `new ModelViewer(scene)` | `scene.mainCamera.controller = new OrbitController()` |
| `new ObjectViewController(scene, opts)` | `scene.mainCamera.controller = new TurntableController(opts)` |
| `new TouchController(scene, opts)` | `scene.mainCamera.controller = new FlyWalkController(opts)` |
| `new FPSController(scene)` | `scene.mainCamera.controller = new FPSController()` |

Import the new class names from `@`.

### 5.2 Input access
| Old | New |
|---|---|
| `renderer.viewer.mouse.*` | `renderer.input.mouse.*` |
| `renderer.viewer.pressedKeys` | `renderer.input.pressedKeys` |
| `renderer.viewer.setCursor(...)` | `renderer.input.setCursor(...)` |

### 5.3 Orbit parameters (old rig → OrbitController)
| Old (`modelViewer.viewer.*` / fields) | New |
|---|---|
| `modelViewer.viewer.angle.x` | `orbit.pitch` |
| `modelViewer.viewer.angle.y` | `orbit.yaw` |
| `modelViewer.viewer.angle.z` (roll) | *(no roll; drop)* |
| `originDistance` zoom | `orbit.distance` (persp) / `Camera.orthoSize` (ortho) |
| `minRotateX` / `maxRotateX` | `orbit.minPitch` / `orbit.maxPitch` |
| `enableDragAcceleration` | *(inertia is built in)* |

### 5.4 Already migrated (reference implementations)
- `examples/helloworld.html` — direct `renderer.input` read, no controller.
- `examples/animation.html` — `OrbitController` (`pitch` / `minPitch` / `maxPitch`).
- `examples/navmesh.html` — `OrbitController` (disabled) + `renderer.input`.

### 5.5 Per-example checklist
- [ ] Replace the controller constructor with `camera.controller = new XxxController(...)`.
- [ ] Map options (use the tables above); drop dead options.
- [ ] Replace any `renderer.viewer.*` with `renderer.input.*`.
- [ ] If the example set the camera pose before attaching, keep it — Orbit derives
      from it; Turntable/FlyWalk respect it.
- [ ] Verify in the browser (render + drag + zoom + keyboard) and check the console.

---

## 6. Notes & known issues

- **FloorView top-view tilt** was simplified to a yaw-only spin when the rig was
  removed; the former pitch tilt (`viewer.angle.x`, clamped −70…10) is gone.
- The `incorrect data check` console error in `floor-walkthrough.html` is the
  embedded ring-cursor archive failing to decode — pre-existing and unrelated to
  camera control.
