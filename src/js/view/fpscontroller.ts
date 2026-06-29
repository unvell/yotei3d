////////////////////////////////////////////////////////////////////////////////
// Yotei3D - Web3D Engine
// Copyright(c) 2024-2025 Jingwood, All Rights Reserved.
////////////////////////////////////////////////////////////////////////////////

import { Vec3, Matrix4 } from "@/math";
import { Keys, MouseButtons } from "../scene/input";
import { invokeIfExist } from "../utility/utility";
import { CameraController } from "./cameracontroller";

interface FPSControllerOptions {
  moveSpeed?: number;
}

// FPSController — first-person camera: WASD / arrows to walk, drag to look,
// Shift+W/S to rise/fall, Shift+drag (or right drag) to slide. Acts on the
// attached Camera; held-key movement runs each frame in update().
export class FPSController extends CameraController {
  options: Required<FPSControllerOptions>;

  /** optional callback fired after a movement step (assign if needed) */
  oncameramove?: (...args: any[]) => any;

  private _m = new Matrix4();
  private _dir = new Vec3();

  static defaultOptions(): Required<FPSControllerOptions> {
    return { moveSpeed: 0.2 };
  }

  constructor(arg?: any, options?: FPSControllerOptions) {
    super();
    const parsed = CameraController.parseArgs(arg, options);
    this.options = { ...FPSController.defaultOptions(), ...(parsed.options || {}) };

    if (parsed.camera) parsed.camera.controller = this;
  }

  protected override onAttach(): void {
    this.bind("begindrag", () => this.renderer.input.setCursor("none"));
    this.bind("enddrag", () => this.renderer.input.setCursor("auto"));
    this.bind("drag", () => this._onDrag());
  }

  private _onDrag(): void {
    if (!this.isActive()) return;
    const input = this.input;

    if (input.mouse.pressedButtons.has(MouseButtons.Left) || input.touch.fingers === 1) {
      if (input.pressedKeys.has(Keys.Shift)) this._dragToMoveCamera();
      else this._dragToRotateCamera();
    }

    if (input.mouse.pressedButtons.has(MouseButtons.Right) || input.touch.fingers === 2) {
      this._dragToMoveCamera();
    }
  }

  private _dragToRotateCamera(): void {
    const input = this.input;
    const camera = this.camera;
    const renderSize = this.renderer.renderSize;

    camera.angle.x -= input.mouse.movement.y * 200 / renderSize.height;
    camera.angle.y -= input.mouse.movement.x * 200 / renderSize.width;

    if (camera.angle.x < -80) camera.angle.x = -80;
    else if (camera.angle.x > 80) camera.angle.x = 80;

    camera.angle.y = (camera.angle.y + 360) % 360;

    this.scene.requireUpdateFrame();
  }

  private _dragToMoveCamera(): void {
    const input = this.input;
    const camera = this.camera;
    const renderSize = this.renderer.renderSize;

    this._m.loadIdentity().rotate(camera.angle);
    const td = new Vec3(
      input.mouse.movement.x * 50 / renderSize.width, 0,
      input.mouse.movement.y * 50 / renderSize.height).mulMat(this._m);

    camera.location.x += td.x;
    camera.location.z += td.z;

    camera.onmove();
    this.scene.requireUpdateFrame();
  }

  override update(dt: number): void {
    const camera = this.camera;
    const input = this.input;
    if (!camera || !input || input.pressedKeys.size === 0) return;

    const k = dt * 60;
    const speed = this.options.moveSpeed;
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

    if (input.pressedKeys.has(Keys.Left)) { camera.angle.y += speed * 10 * k; moved = true; }
    else if (input.pressedKeys.has(Keys.Right)) { camera.angle.y -= speed * 10 * k; moved = true; }

    camera.angle.y = (camera.angle.y + 360) % 360;

    if (dir.x !== 0 || dir.y !== 0 || dir.z !== 0) {
      this._m.loadIdentity().rotate(camera.angle);
      let td = dir.mulMat(this._m);
      td.y = 0;
      td = td.normalize();
      camera.move(td.x * speed * k, 0, td.z * speed * k);
      invokeIfExist(this, "oncameramove");
      moved = true;
    }

    if (moved) this.scene.requireUpdateFrame();
  }
}
