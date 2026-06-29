////////////////////////////////////////////////////////////////////////////////
// Yotei3D - Web3D Engine
// Copyright(c) 2024-2025 Jingwood, All Rights Reserved.
////////////////////////////////////////////////////////////////////////////////

import { Vec3 } from "@/math";
import { Keys } from "../scene/input";
import { performMovementAccelerationAnimation } from "../utility/utility";
import { CameraController } from "./cameracontroller";

interface TurntableControllerOptions {
  targetObject?: any;
  enableHorizontalRotation?: boolean;
  enableVerticalRotation?: boolean;
  enableScrollToScaleObject?: boolean;   // legacy name: enables wheel zoom (dolly)
  minVerticalRotateAngle?: number;
  maxVerticalRotateAngle?: number;
  enableDragAcceleration?: boolean;
  dragAccelerationAttenuation?: number;
  dragAccelerationIntensity?: number;
  minDistance?: number;
  maxDistance?: number;
}

// TurntableController — observe a single object from any angle by spinning the
// object on a "turntable" while the camera stays where you placed it (lighting
// stays fixed, so shading changes as the object turns). Successor to the old
// ObjectViewController; zoom now dollies the camera instead of driving the
// removed global viewer rig.
export class TurntableController extends CameraController {
  targetObject: any;

  enableHorizontalRotation: boolean;
  enableVerticalRotation: boolean;
  enableScrollToScaleObject: boolean;
  minVerticalRotateAngle: number;
  maxVerticalRotateAngle: number;
  enableDragAcceleration: boolean;
  dragAccelerationAttenuation: number;
  dragAccelerationIntensity: number;
  minDistance: number;
  maxDistance: number;

  private startDragTime = 0;

  constructor(arg?: any, options?: TurntableControllerOptions) {
    super();
    const parsed = CameraController.parseArgs(arg, options);
    const o: TurntableControllerOptions = parsed.options || {};

    this.targetObject = o.targetObject;

    this.enableHorizontalRotation = o.enableHorizontalRotation ?? true;
    this.enableVerticalRotation = o.enableVerticalRotation ?? true;
    this.enableScrollToScaleObject = o.enableScrollToScaleObject ?? true;
    this.minVerticalRotateAngle = o.minVerticalRotateAngle ?? -90;
    this.maxVerticalRotateAngle = o.maxVerticalRotateAngle ?? 90;
    this.enableDragAcceleration = o.enableDragAcceleration ?? true;
    this.dragAccelerationAttenuation = o.dragAccelerationAttenuation ?? 0.03;
    this.dragAccelerationIntensity = o.dragAccelerationIntensity ?? 5;
    this.minDistance = o.minDistance ?? 0.1;
    this.maxDistance = o.maxDistance ?? 500;

    if (parsed.camera) parsed.camera.controller = this;
  }

  protected override onAttach(): void {
    this.bind("begindrag", () => { this.startDragTime = Date.now(); });
    this.bind("drag", () => this._onDrag());
    this.bind("mousewheel", () => this._onWheel());
    this.bind("enddrag", () => this._dragAcceleration());
  }

  private _targetPoint(): Vec3 {
    if (this.targetObject && this.targetObject.worldLocation) {
      const w = this.targetObject.worldLocation;
      return new Vec3(w.x, w.y, w.z);
    }
    return new Vec3(0, 0, 0);
  }

  private _onDrag(): void {
    if (!this.isActive()) return;

    const keys = this.input.pressedKeys;
    if (keys.has(Keys.Shift)) {
      this._pan();
    } else if (keys.has(Keys.Control)) {
      const mv = this.input.mouse.movement;
      this._zoom((mv.x + mv.y) / 10);
    } else {
      this._rotate();
    }
  }

  private _onWheel(): void {
    if (!this.isActive() || !this.enableScrollToScaleObject) return;
    this._zoom(-this.input.mouse.wheeldelta / 300);
  }

  private _rotate(): void {
    if (!this.targetObject) return;
    const movement = this.input.mouse.movement;

    if (this.enableHorizontalRotation) this.targetObject.angle.y += movement.x;
    if (this.enableVerticalRotation) this.targetObject.angle.x += movement.y;

    this._limitAngle();
    this.scene.requireUpdateFrame();
  }

  private _pan(): void {
    if (!this.targetObject) return;
    const mv = this.input.mouse.movement;
    this.targetObject.moveOffset(mv.x / 50, -mv.y / 50, 0);
  }

  // dolly the camera toward / away from the target along its view direction
  private _zoom(deltaDistance: number): void {
    const cam = this.camera;
    if (!cam) return;

    const tgt = this._targetPoint();
    const v = Vec3.sub(cam.location, tgt);     // target -> camera
    const d = Vec3.length(v);
    let nd = d + deltaDistance;
    if (nd < this.minDistance) nd = this.minDistance;
    else if (nd > this.maxDistance) nd = this.maxDistance;

    const dir = d > 1e-6 ? Vec3.mul(v, 1 / d) : new Vec3(0, 0, 1);
    cam.location.set(tgt.x + dir.x * nd, tgt.y + dir.y * nd, tgt.z + dir.z * nd);
    cam.orthoSize = nd;
    this.scene.requireUpdateFrame();
  }

  private _limitAngle(): void {
    if (!this.targetObject) return;
    const a = this.targetObject.angle;
    if (a.x < this.minVerticalRotateAngle) a.x = this.minVerticalRotateAngle;
    if (a.x > this.maxVerticalRotateAngle) a.x = this.maxVerticalRotateAngle;
    if (a.y < 0) a.y += 360;
    if (a.y > 360) a.y -= 360;
  }

  private _dragAcceleration(): void {
    if (!this.isActive() || !this.enableDragAcceleration || !this.targetObject) return;

    if ((Date.now() - this.startDragTime) < 300) {
      performMovementAccelerationAnimation(this.scene,
        this.dragAccelerationIntensity, this.dragAccelerationAttenuation, (xdiff: number, ydiff: number) => {
          if (this.enableHorizontalRotation) this.targetObject.angle.y += xdiff;
          if (this.enableVerticalRotation) this.targetObject.angle.x += ydiff;
          this._limitAngle();
        });
    }
  }
}
