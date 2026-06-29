////////////////////////////////////////////////////////////////////////////////
// Yotei3D - Web3D Engine
// Copyright(c) 2024-2025 Jingwood, All Rights Reserved.
////////////////////////////////////////////////////////////////////////////////

import { Camera } from "../scene/camera";

// Base class for all camera controllers (orbit / turntable / fly-walk / fps).
//
// A controller is *attached to a Camera* (Unity/Babylon style):
//
//     camera.controller = new OrbitController({ distance: 5 });
//
// The Camera setter calls attach()/detach() for you. For backward compatibility
// the concrete controllers also accept the legacy `(scene, options)` / `(camera,
// options)` constructor form, which auto-attaches to scene.mainCamera.
//
// Input is read from the renderer's shared InputManager (renderer.input). Scene
// events (drag, mousewheel, ...) are subscribed in onAttach() via this.bind()
// and automatically removed in detach(). Per-frame logic (held-key movement,
// inertia) goes in update(dt); the renderer calls tick() once per animation
// frame for the active camera.
export abstract class CameraController {
  camera: any = null;
  enabled = true;

  private _bound: Array<{ target: any; event: string; listener: any }> = [];
  private _lastTime = 0;

  // --- environment accessors (valid once attached to a camera in a scene) ---
  protected get scene(): any { return this.camera ? this.camera.scene : null; }
  protected get renderer(): any { return this.scene ? this.scene.renderer : null; }
  protected get input(): any { return this.renderer ? this.renderer.input : null; }

  // Resolve the legacy positional first argument into a target camera and an
  // options object. Accepts a Camera, a Scene (-> its mainCamera), or an options
  // object (-> no auto-attach; assign via camera.controller = ...).
  protected static parseArgs(arg: any, options: any): { camera: any; options: any } {
    if (arg instanceof Camera) {
      return { camera: arg, options: options || {} };
    }
    if (arg && arg.renderer && "mainCamera" in arg) {
      // a Scene
      return { camera: arg.mainCamera, options: options || {} };
    }
    // first argument is the options object (new API)
    return { camera: null, options: arg || {} };
  }

  // Called by Camera's controller setter. Subclasses override onAttach().
  attach(camera: any): void {
    if (this.camera === camera) return;
    if (this.camera) this.detach();
    this.camera = camera;
    this._lastTime = 0;
    this.onAttach();
  }

  // Called by Camera's controller setter (and dispose). Removes all scene event
  // subscriptions, then lets the subclass clean up.
  detach(): void {
    for (const b of this._bound) {
      if (b.target && typeof b.target.removeEventListener === "function") {
        b.target.removeEventListener(b.event, b.listener);
      }
    }
    this._bound.length = 0;
    this.onDetach();
    this.camera = null;
  }

  // Subscribe to a scene event and track it for automatic removal on detach.
  protected bind(event: string, handler: (...args: any[]) => any, target?: any): void {
    const t = target || this.scene;
    if (!t || typeof t.on !== "function") return;
    const listener = t.on(event, handler);
    this._bound.push({ target: t, event, listener });
  }

  // True when this controller may act: enabled and driving the active camera.
  protected isActive(): boolean {
    return this.enabled && !!this.scene && this.scene.mainCamera === this.camera;
  }

  // Called once per animation frame by the renderer for the active camera.
  // Computes a clamped dt and forwards to update().
  tick(): void {
    const now = (typeof performance !== "undefined") ? performance.now() : Date.now();
    let dt = this._lastTime ? (now - this._lastTime) / 1000 : 1 / 60;
    this._lastTime = now;
    if (dt > 0.1) dt = 0.1;       // clamp big gaps (tab switch, breakpoint)
    if (this.enabled && this.isActive()) this.update(dt);
  }

  dispose(): void {
    this.detach();
  }

  // --- subclass hooks ---
  protected onAttach(): void {}
  protected onDetach(): void {}
  update(_dt: number): void {}
}
