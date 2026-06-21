import { Keys } from "../scene/viewer";
import { performMovementAccelerationAnimation } from "../utility/utility";

interface ObjectViewControllerOptions {
  enableHorizontalRotation?: boolean;
  enableVerticalRotation?: boolean;
  enableScrollToScaleObject?: boolean;
  minVerticalRotateAngle?: number;
  maxVerticalRotateAngle?: number;
  enableDragAcceleration?: boolean;
  dragAccelerationAttenuation?: number;
  dragAccelerationIntensity?: number;
  targetObject?: any;
}

export class ObjectViewController {
  scene: any;
  renderer: any;
  viewer: any;
  _enabled: boolean;
  targetObject: any;

  enableHorizontalRotation: boolean;
  enableVerticalRotation: boolean;
  enableScrollToScaleObject: boolean;
  minVerticalRotateAngle: number;
  maxVerticalRotateAngle: number;
  enableDragAcceleration: boolean;
  dragAccelerationAttenuation: number;
  dragAccelerationIntensity: number;

  sceneDragHandlerListener: any;
  sceneMouseWheelHandlerListener: any;
  sceneMouseDragAccelerationHandler: any;
  startDragTime: number;

  constructor(scene: any, {
    enableHorizontalRotation = true,
    enableVerticalRotation = true,
    enableScrollToScaleObject = true,

    minVerticalRotateAngle = -90,
    maxVerticalRotateAngle = 90,

    enableDragAcceleration = true,
    dragAccelerationAttenuation = 0.03,
    dragAccelerationIntensity = 5,

    targetObject,
  }: ObjectViewControllerOptions = {}) {
    this.scene = scene;
    this.renderer = scene.renderer;
    this.viewer = scene.renderer.viewer;
    this._enabled = true;
    this.targetObject = targetObject;

    this.enableHorizontalRotation = enableHorizontalRotation;
    this.enableVerticalRotation = enableVerticalRotation;
    this.enableScrollToScaleObject = enableScrollToScaleObject;
    this.minVerticalRotateAngle = minVerticalRotateAngle;
    this.maxVerticalRotateAngle = maxVerticalRotateAngle;
    this.enableDragAcceleration = enableDragAcceleration;
    this.dragAccelerationAttenuation = dragAccelerationAttenuation;
    this.dragAccelerationIntensity = dragAccelerationIntensity;

    this.sceneDragHandlerListener = scene.on("drag", () => this.sceneDragHandler());
    this.sceneMouseWheelHandlerListener = scene.on("mousewheel", () => this.sceneMouseWheelHandler());
    this.sceneMouseDragAccelerationHandler = scene.on("enddrag", () => this.dragAcceleration());

    this.startDragTime = 0;
    this.scene.on("begindrag", () => {
      this.startDragTime = Date.now();
    });
  }

  get enabled(): boolean {
    return this._enabled;
  }
  set enabled(v: boolean) {
    this._enabled = v;
  }

  sceneDragHandler(): void {
    if (!this._enabled) return;

    if (this.viewer.pressedKeys.has(Keys.Shift)) {
      this.panObjectByMouseMove();
    } else if (this.viewer.pressedKeys.has(Keys.Control)) {
      this.zoomViewByMouseButton();
    } else {
      this.dragToRotateObject();
    }
  }

  sceneMouseWheelHandler(): void {
    if (!this._enabled) return;

    this.zoomViewByMouseWheel();
  }

  zoomViewByMouseWheel(): void {
    if (!this._enabled) return;

    let s = this.viewer.originDistance - this.viewer.mouse.wheeldelta / 3000;
    if (s > 50) s = 50; else if (s < 0) s = 0;
    this.viewer.originDistance = s;
    this.scene.requireUpdateFrame();
  }

  zoomViewByMouseButton(): void {
    if (!this._enabled) return;

    let s = this.viewer.originDistance - (this.viewer.mouse.movement.x + this.viewer.mouse.movement.y) / -100;
    if (s > 50) s = 50; else if (s < 0) s = 0;
    this.viewer.originDistance = s;
    this.scene.requireUpdateFrame();
  }

  panObjectByMouseMove(): void {
    if (!this._enabled || !this.targetObject) return;

    this.targetObject.moveOffset(this.viewer.mouse.movement.x / 50, -this.viewer.mouse.movement.y / 50, 0);
  }

  limitViewAngleScope(): void {
    if (!this.targetObject) return;

    if (this.targetObject.angle.x < this.minVerticalRotateAngle) this.targetObject.angle.x = this.minVerticalRotateAngle;
    if (this.targetObject.angle.x > this.maxVerticalRotateAngle) this.targetObject.angle.x = this.maxVerticalRotateAngle;

    if (this.targetObject.angle.y < 0) this.targetObject.angle.y += 360;
    if (this.targetObject.angle.y > 360) this.targetObject.angle.y -= 360;
  }

  dragToRotateObject(): void {
    if (!this._enabled || !this.targetObject) return;

    const movement = this.viewer.mouse.movement;

    if (this.enableHorizontalRotation) {
      this.targetObject.angle.y += movement.x;
    }
    if (this.enableVerticalRotation) {
      this.targetObject.angle.x += movement.y;
    }

    this.limitViewAngleScope();
    this.scene.requireUpdateFrame();
  }

  dragAcceleration(): void {
    if (!this._enabled || !this.targetObject) return;
    if (!this.enableDragAcceleration) return;

    const scene = this.scene, viewer = this.viewer;

    if ((Date.now() - this.startDragTime) < 300) {
      performMovementAccelerationAnimation(scene,
        this.dragAccelerationIntensity, this.dragAccelerationAttenuation, (xdiff: number, ydiff: number) => {

          if (this.enableHorizontalRotation) {
            this.targetObject.angle.y += xdiff;
          }

          if (this.enableVerticalRotation) {
            this.targetObject.angle.x += ydiff;
          }

          this.limitViewAngleScope();
        });
    }
  }
}
