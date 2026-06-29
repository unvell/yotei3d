////////////////////////////////////////////////////////////////////////////////
// Yotei3D - Web3D Engine
// Copyright(c) 2024-2025 Jingwood, All Rights Reserved.
////////////////////////////////////////////////////////////////////////////////

import { Vec3 } from "@/math";
import { Keys } from "../scene/input";
import { CameraController } from "./cameracontroller";

const DEG = Math.PI / 180;

interface OrbitControllerOptions {
  target?: any;            // pivot point (Vec3 | {x,y,z}); default (0,0,0)
  distance?: number;       // camera distance from target
  yaw?: number;            // initial azimuth (deg, around Y)
  pitch?: number;          // initial elevation (deg, around X)

  rotateSpeed?: number;    // constant rotation impulse per drag step (deg/s)
  zoomSpeed?: number;      // constant zoom impulse per wheel/drag step (units/s)
  panSpeed?: number;       // constant pan impulse per drag step (units/s)
  inertia?: number;        // velocity retained per 1/60s frame (0..1); higher = longer glide

  minPitch?: number;
  maxPitch?: number;
  minDistance?: number;
  maxDistance?: number;

  enableRotate?: boolean;
  enableZoom?: boolean;
  enablePan?: boolean;
}

function toVec3(v: any, fallback: Vec3): Vec3 {
  if (v instanceof Vec3) return v.clone();
  if (v && typeof v === "object") return new Vec3(v.x || 0, v.y || 0, v.z || 0);
  return fallback.clone();
}

function unit(v: number): number {
  return v > 0 ? 1 : (v < 0 ? -1 : 0);
}

// OrbitController — a true orbit camera that revolves the *camera* around a pivot
// (replaces the old viewer-rig ModelViewer). All motion — rotate, zoom, pan — is
// driven by a uniform "constant impulse + inertia" model: each drag/wheel step
// adds a *fixed* amount to a velocity (independent of how fast the pointer moved),
// and every frame that velocity is integrated and damped, so motion glides to a
// smooth stop after release.
export class OrbitController extends CameraController {
  target: Vec3;
  private _distance: number;
  private _yaw: number;
  private _pitch: number;

  rotateSpeed: number;
  zoomSpeed: number;
  panSpeed: number;
  inertia: number;

  minPitch: number;
  maxPitch: number;
  minDistance: number;
  maxDistance: number;

  enableRotate: boolean;
  enableZoom: boolean;
  enablePan: boolean;

  // velocities (per second)
  private yawVel = 0;
  private pitchVel = 0;
  private distVel = 0;
  private panVel = { x: 0, y: 0 };
  private _needsApply = false;

  // which orbit params the caller pinned via options; the rest are derived from
  // the camera's existing pose on attach so we don't snap a placed camera.
  private _hasTarget: boolean;
  private _hasDistance: boolean;
  private _hasYaw: boolean;
  private _hasPitch: boolean;

  constructor(arg?: any, options?: OrbitControllerOptions) {
    super();
    const parsed = CameraController.parseArgs(arg, options);
    const o: OrbitControllerOptions = parsed.options || {};

    this._hasTarget = o.target !== undefined;
    this._hasDistance = o.distance !== undefined;
    this._hasYaw = o.yaw !== undefined;
    this._hasPitch = o.pitch !== undefined;

    this.target = toVec3(o.target, new Vec3(0, 0, 0));
    this._distance = o.distance ?? 5;
    this._yaw = o.yaw ?? 0;
    this._pitch = o.pitch ?? 15;

    this.rotateSpeed = o.rotateSpeed ?? 15;
    this.zoomSpeed = o.zoomSpeed ?? 6;
    this.panSpeed = o.panSpeed ?? 4;
    this.inertia = o.inertia ?? 0.9;

    this.minPitch = o.minPitch ?? -89;
    this.maxPitch = o.maxPitch ?? 89;
    this.minDistance = o.minDistance ?? 0.1;
    this.maxDistance = o.maxDistance ?? 500;

    this.enableRotate = o.enableRotate ?? true;
    this.enableZoom = o.enableZoom ?? true;
    this.enablePan = o.enablePan ?? true;

    if (parsed.camera) parsed.camera.controller = this;
  }

  get distance(): number { return this._distance; }
  set distance(v: number) { this._distance = this._clampDistance(v); this._apply(); }

  get yaw(): number { return this._yaw; }
  set yaw(v: number) { this._yaw = v; this._apply(); }

  get pitch(): number { return this._pitch; }
  set pitch(v: number) { this._pitch = this._clampPitch(v); this._apply(); }

  setTarget(t: any): void { this.target = toVec3(t, this.target); this._apply(); }

  protected override onAttach(): void {
    this._deriveFromCamera();
    this.bind("drag", () => this._onDrag());
    this.bind("mousewheel", () => this._onWheel());
    this._apply();
    if (this.scene) this.scene.requireUpdateFrame();
  }

  // Initialize non-pinned orbit params (distance / yaw / pitch) from the camera's
  // current pose, so attaching to an already-placed camera reproduces that exact
  // view instead of snapping to defaults. Options passed to the constructor win.
  private _deriveFromCamera(): void {
    const camera = this.camera;
    if (!camera) return;

    const v = Vec3.sub(camera.location, this.target);   // target -> camera
    const d = Vec3.length(v);
    if (d < 1e-4) return;                                // camera sits on target; keep defaults

    if (!this._hasDistance) this._distance = this._clampDistance(d);
    if (!this._hasYaw || !this._hasPitch) {
      const dir = Vec3.mul(v, 1 / d);
      const sy = Math.max(-1, Math.min(1, dir.y));
      if (!this._hasPitch) this._pitch = this._clampPitch(Math.asin(sy) / DEG);
      if (!this._hasYaw) this._yaw = Math.atan2(dir.x, dir.z) / DEG;
    }
  }

  protected override onDetach(): void {
    this.yawVel = this.pitchVel = this.distVel = 0;
    this.panVel.x = this.panVel.y = 0;
  }

  private _clampPitch(v: number): number {
    return v < this.minPitch ? this.minPitch : (v > this.maxPitch ? this.maxPitch : v);
  }
  private _clampDistance(v: number): number {
    return v < this.minDistance ? this.minDistance : (v > this.maxDistance ? this.maxDistance : v);
  }

  private _onDrag(): void {
    if (!this.isActive()) return;

    const mv = this.input.mouse.movement;
    const keys = this.input.pressedKeys;

    if (this.enablePan && keys.has(Keys.Shift)) {
      this.panVel.x += -unit(mv.x) * this.panSpeed;
      this.panVel.y += unit(mv.y) * this.panSpeed;
    } else if (this.enableZoom && keys.has(Keys.Control)) {
      this.distVel += -unit(mv.x + mv.y) * this.zoomSpeed;
    } else if (this.enableRotate) {
      this.yawVel += -unit(mv.x) * this.rotateSpeed;
      this.pitchVel += unit(mv.y) * this.rotateSpeed;
    }

    this._wake();
  }

  private _onWheel(): void {
    if (!this.isActive() || !this.enableZoom) return;
    const wd = this.input.mouse.wheeldelta;
    this.distVel += (wd > 0 ? -1 : 1) * this.zoomSpeed;
    this._wake();
  }

  private _wake(): void {
    this._needsApply = true;
    const scene = this.scene;
    if (scene) scene.requireUpdateFrame();
  }

  override update(dt: number): void {
    const decay = Math.pow(this.inertia, dt * 60);
    const eps = 0.001;

    let moving = false;

    if (Math.abs(this.yawVel) > eps || Math.abs(this.pitchVel) > eps) {
      this._yaw += this.yawVel * dt;
      this._pitch = this._clampPitch(this._pitch + this.pitchVel * dt);
      this.yawVel *= decay; this.pitchVel *= decay;
      if (Math.abs(this.yawVel) <= eps) this.yawVel = 0;
      if (Math.abs(this.pitchVel) <= eps) this.pitchVel = 0;
      moving = true;
    }

    if (Math.abs(this.distVel) > eps) {
      this._distance = this._clampDistance(this._distance + this.distVel * dt);
      this.distVel *= decay;
      if (Math.abs(this.distVel) <= eps) this.distVel = 0;
      moving = true;
    }

    if (Math.abs(this.panVel.x) > eps || Math.abs(this.panVel.y) > eps) {
      this._panBy(this.panVel.x * dt, this.panVel.y * dt);
      this.panVel.x *= decay; this.panVel.y *= decay;
      if (Math.abs(this.panVel.x) <= eps) this.panVel.x = 0;
      if (Math.abs(this.panVel.y) <= eps) this.panVel.y = 0;
      moving = true;
    }

    if (moving || this._needsApply) {
      this._apply();
      const scene = this.scene;
      if (scene && moving) scene.requireUpdateFrame();
      if (!moving) this._needsApply = false;
    }
  }

  // current direction from target to camera
  private _dir(): Vec3 {
    const rx = this._pitch * DEG, ry = this._yaw * DEG;
    const cx = Math.cos(rx);
    return new Vec3(cx * Math.sin(ry), Math.sin(rx), cx * Math.cos(ry));
  }

  private _panBy(dx: number, dy: number): void {
    const dir = this._dir();                       // target -> camera
    const forward = Vec3.normalize(Vec3.mul(dir, -1)); // camera -> target
    const right = Vec3.normalize(Vec3.cross(forward, Vec3.up));
    const up = Vec3.normalize(Vec3.cross(right, forward));
    // scale pan with distance so it feels consistent at any zoom
    const s = Math.max(this._distance, 0.001) * 0.2;
    this.target = Vec3.add(this.target, Vec3.add(Vec3.mul(right, dx * s), Vec3.mul(up, dy * s)));
  }

  // position the camera from (target, distance, yaw, pitch) and look at the pivot
  private _apply(): void {
    const camera = this.camera;
    if (!camera) return;
    const dir = this._dir();
    camera.location.set(
      this.target.x + dir.x * this._distance,
      this.target.y + dir.y * this._distance,
      this.target.z + dir.z * this._distance);
    camera.lookAt(this.target, Vec3.up);
    camera.orthoSize = this._distance;
  }
}
