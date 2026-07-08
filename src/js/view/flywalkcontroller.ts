////////////////////////////////////////////////////////////////////////////////
// Yotei3D - Web3D Engine
// Copyright(c) 2024-2025 Jingwood, All Rights Reserved.
////////////////////////////////////////////////////////////////////////////////

import { Vec3, Matrix4 } from "@/math";
import { Keys, MouseButtons } from "../scene/input";
import { performMovementAccelerationAnimation, invokeIfExist } from "../utility/utility";
import { CameraController } from "./cameracontroller";

interface FlyWalkControllerOptions {
  speed?: number;
  distance?: number;
  clickToMove?: boolean;
  dragAccelerationAttenuation?: number;
  dragAccelerationIntensity?: number;
}

// FlyWalkController — free walk + fly movement of the camera (WASD / arrows to
// move, drag to look, Shift+W/S to rise/fall, wheel to dolly, optional click to
// move). Successor to the misleadingly-named TouchController. Acts directly on
// the attached Camera; per-frame held-key movement runs in update().
export class FlyWalkController extends CameraController {
  options: Required<FlyWalkControllerOptions>;

  /** optional callback fired after a movement step (assign if needed) */
  oncameramove?: (...args: any[]) => any;

  private _startDragTime = 0;
  private _docWheel?: (e: any) => any;
  private _m = new Matrix4();
  private _dir = new Vec3();

  static defaultOptions(): Required<FlyWalkControllerOptions> {
    return {
      speed: 0.02,
      distance: 1,
      clickToMove: true,
      dragAccelerationAttenuation: 0.05,
      dragAccelerationIntensity: 2.0,
    };
  }

  constructor(arg?: any, options?: FlyWalkControllerOptions) {
    super();
    const parsed = CameraController.parseArgs(arg, options);
    this.options = { ...FlyWalkController.defaultOptions(), ...(parsed.options || {}) };

    if (parsed.camera) parsed.camera.controller = this;
  }

  protected override onAttach(): void {
    this.bind("begindrag", () => { this._startDragTime = Date.now(); });
    this.bind("enddrag", () => this._dragAcceleration());
    this.bind("drag", () => this._onDrag());

    if (this.options.clickToMove) {
      this.bind("mouseup", () => this._onClickMove());
    }

    this._docWheel = (e: any) => {
      if (!this.isActive()) return;
      const camera = this.camera;
      camera.angle.y -= (e.deltaX) / 10;
      camera.angle.y %= 360;
      camera.forward(-(e.deltaY) / 200, { animation: false });
      this.scene.requireUpdateFrame();
      e.preventDefault();
      return false;
    };
    document.addEventListener("mousewheel", this._docWheel, { passive: false } as any);
  }

  protected override onDetach(): void {
    if (this._docWheel) {
      document.removeEventListener("mousewheel", this._docWheel as any);
      this._docWheel = undefined;
    }
  }

  override update(dt: number): void {
    const camera = this.camera;
    const input = this.input;
    if (!camera || !input) return;

    const k = dt * 60;                  // normalize to the legacy ~60fps step
    const speed = this.options.speed;
    const dir = this._dir;
    dir.set(0, 0, 0);
    let moved = false;

    if (input.pressedKeys.has(Keys.A)) dir.x = -1;
    else if (input.pressedKeys.has(Keys.D)) dir.x = 1;

    if (input.pressedKeys.has(Keys.W) || input.pressedKeys.has(Keys.Up)) {
      if (input.pressedKeys.has(Keys.Shift)) { camera.location.y += speed * k; moved = true; }
      else dir.z = -1;
    } else if (input.pressedKeys.has(Keys.S) || input.pressedKeys.has(Keys.Down)) {
      if (input.pressedKeys.has(Keys.Shift)) { camera.location.y -= speed * k; moved = true; }
      else dir.z = 1;
    }

    if (input.pressedKeys.has(Keys.Left)) { camera.angle.y += speed * 20 * k; moved = true; }
    else if (input.pressedKeys.has(Keys.Right)) { camera.angle.y -= speed * 20 * k; moved = true; }

    camera.angle.y = (camera.angle.y + 360) % 360;

    if (dir.x !== 0 || dir.y !== 0 || dir.z !== 0) {
      this._m.loadIdentity().rotate(camera.angle);
      let td = dir.mulMat(this._m);
      td.y = 0;
      td = td.normalize();
      // keep camera level on WASD (Shift handles vertical)
      camera.move(td.x * speed * 2 * k, 0, td.z * speed * 2 * k);
      invokeIfExist(this, "oncameramove");
      moved = true;
    }

    if (moved) this.scene.requireUpdateFrame();
  }

  private _onClickMove(): void {
    if (!this.isActive()) return;
    const camera = this.camera;
    if (this.input.pressedKeys.has(Keys.Shift)
      || this.input.mouse.pressedButtons.has(MouseButtons.Right)) {
      camera.backward(this.options.distance, this.options);
    } else {
      camera.forward(this.options.distance, this.options);
    }
  }

  private _onDrag(): void {
    if (!this.isActive()) return;
    const input = this.input;
    const camera = this.camera;
    const renderSize = this.renderer.renderSize;

    if (input.mouse.pressedButtons.has(MouseButtons.Left) || input.touch.fingers === 1) {
      camera.angle.x += input.mouse.movement.y * 200 / renderSize.height;
      camera.angle.y += input.mouse.movement.x * 200 / renderSize.width;

      if (camera.angle.x < -80) camera.angle.x = -80;
      else if (camera.angle.x > 80) camera.angle.x = 80;

      camera.angle.y = (camera.angle.y + 360) % 360;

      this.scene.requireUpdateFrame();
    }

    if (input.mouse.pressedButtons.has(MouseButtons.Right) || input.touch.fingers === 2) {
      this._m.loadIdentity().rotate(camera.angle);
      const td = new Vec3(
        input.mouse.movement.x * 30 / renderSize.width, 0,
        input.mouse.movement.y * 30 / renderSize.height).mulMat(this._m);
      camera.move(-td.x, 0, -td.z);
      this.scene.requireUpdateFrame();
    }
  }

  private _dragAcceleration(): void {
    if (!this.isActive()) return;
    if ((Date.now() - this._startDragTime) < 300) {
      performMovementAccelerationAnimation(this.scene,
        this.options.dragAccelerationIntensity, this.options.dragAccelerationAttenuation,
        (xdiff: number, ydiff: number) => {
          this.camera.angle.y += xdiff;
          this.camera.angle.x += ydiff;
        });
    }
  }
}
