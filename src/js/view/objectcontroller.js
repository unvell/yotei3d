import { Keys } from "@";
import { performMovementAccelerationAnimation } from "../utility/utility";

export class ObjectViewController {
  constructor(scene, {
    enableHorizontalRotation = true,
    enableVerticalRotation = true,
    enableScrollToScaleObject = true,
  
    minVerticalRotateAngle = -90,
    maxVerticalRotateAngle = 90,
  
    enableDragAcceleration = true,
    dragAccelerationAttenuation = 0.03,
    dragAccelerationIntensity = 5,

    targetObject,
  } = {}) {
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

    this.sceneDragHandlerListener = scene.on("drag", _ => this.sceneDragHandler());
    this.sceneMouseWheelHandlerListener = scene.on("mousewheel", _ => this.sceneMouseWheelHandler());
    this.sceneMouseDragAccelerationHandler = scene.on("enddrag", _ => this.dragAcceleration());

    this.startDragTime = 0;
    this.scene.on("begindrag", _ => {
      this.startDragTime = Date.now();
    });
  }

  get enabled() {
    return _enabled;
  }
  set enabled(v) {
    this._enabled = v;
  }

  sceneDragHandler() {
    if (!this._enabled) return;

    
    if (this.viewer.pressedKeys.has(Keys.Shift)) {
      this.panObjectByMouseMove();
    } else if (this.viewer.pressedKeys.has(Keys.Control)) {
      this.zoomViewByMouseButton();
    } else {
      this.dragToRotateObject();
    }
  }

  sceneMouseWheelHandler() {
    if (!this._enabled) return;

    this.zoomViewByMouseWheel();
  }

  zoomViewByMouseWheel() {
    if (!this._enabled) return;

    let s = this.viewer.originDistance - this.viewer.mouse.wheeldelta / 3000;
    if (s > 50) s = 50; else if (s < 0) s = 0;
    this.viewer.originDistance = s;
    this.scene.requireUpdateFrame();
  }

  zoomViewByMouseButton() {
    if (!this._enabled) return;

    let s = this.viewer.originDistance - (this.viewer.mouse.movement.x + this.viewer.mouse.movement.y) / -100;
    if (s > 50) s = 50; else if (s < 0) s = 0;
    this.viewer.originDistance = s;
    this.scene.requireUpdateFrame();
  }

  panObjectByMouseMove() {
    if (!this._enabled || !this.targetObject) return;

    this.targetObject.moveOffset(this.viewer.mouse.movement.x / 50, -this.viewer.mouse.movement.y / 50, 0);
  }

  limitViewAngleScope() {
    if (!this.targetObject) return;

    if (this.targetObject.angle.x < this.minVerticalRotateAngle) this.targetObject.angle.x = this.minVerticalRotateAngle;
    if (this.targetObject.angle.x > this.maxVerticalRotateAngle) this.targetObject.angle.x = this.maxVerticalRotateAngle;

    if (this.targetObject.angle.y < 0) this.targetObject.angle.y += 360;
    if (this.targetObject.angle.y > 360) this.targetObject.angle.y -= 360;
  }

  dragToRotateObject() {
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

  dragAcceleration() {
    if (!this._enabled || !this.targetObject) return;
    if (!this.enableDragAcceleration) return;

    const scene = this.scene, viewer = this.viewer;

    if ((Date.now() - this.startDragTime) < 300) {
      performMovementAccelerationAnimation(scene,
        this.dragAccelerationIntensity, this.dragAccelerationAttenuation, (xdiff, ydiff) => {

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
