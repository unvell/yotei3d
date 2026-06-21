import { Keys } from '../scene/viewer.js';
import { performMovementAccelerationAnimation } from '../utility/utility';

interface ModelViewerOptions {
  dragBehavior?: string;
}

export class ModelViewer {
  scene: any;
  renderer: any;
  viewer: any;
  enabled: boolean;

  minRotateX: number;
  maxRotateX: number;
  startDragTime: number;
  enableDragAcceleration: boolean;
  dragAccelerationAttenuation: number;
  dragAccelerationIntensity: number;
  maximalZoomDistance: number;
  minimalZoomDistance: number;
  dragBehavior?: string;

  sceneDragHandlerListener: any;
  sceneMouseWheelHandlerListener: any;
  sceneMouseDragAccelerationHandler: any;

  constructor(scene: any, { dragBehavior }: ModelViewerOptions = {}) {
    this.scene = scene;
    this.renderer = scene.renderer;
    this.viewer = scene.renderer.viewer;
    this.enabled = true;

    this.minRotateX = -90;
    this.maxRotateX = 90;
    this.startDragTime = 0;
    this.enableDragAcceleration = true;
    this.dragAccelerationAttenuation = 0.03;
    this.dragAccelerationIntensity = 5;
    this.maximalZoomDistance = 10;
    this.minimalZoomDistance = 0;
    this.dragBehavior = dragBehavior;

    this.sceneDragHandlerListener = undefined;
    this.sceneMouseWheelHandlerListener = undefined;
    this.sceneMouseDragAccelerationHandler = undefined;

    this.scene.on("begindrag", () => {
      this.startDragTime = Date.now();
    });

    this.attach();
  }

  attach(): void {
    const scene = this.scene;

    if (scene) {
      this.sceneDragHandlerListener = scene.on("drag", () => this.sceneDragHandler());
      this.sceneMouseWheelHandlerListener = scene.on("mousewheel", () => this.sceneMouseWheelHandler());
      this.sceneMouseDragAccelerationHandler = scene.on("enddrag", () => this.dragAcceleration());
    }
  }

  detach(): void {
    const scene = this.scene;

    if (this.sceneDragHandlerListener) {
      scene.removeEventListener("drag", this.sceneDragHandlerListener);
      this.sceneMouseWheelHandlerListener = undefined;
    }

    if (this.sceneMouseWheelHandlerListener) {
      scene.removeEventListener("mousewheel", this.sceneMouseWheelHandlerListener);
      this.sceneMouseWheelHandlerListener = undefined;
    }

    if (this.sceneMouseDragAccelerationHandler) {
      scene.removeEventListener("enddrag", this.sceneMouseWheelHandlerListener);
      this.sceneMouseDragAccelerationHandler = undefined;
    }
  }

  sceneDragHandler(): void {
    if (!this.enabled) return;

    if (this.dragBehavior === "pan") {
      if (this.viewer.pressedKeys.has(Keys.Shift)) {
        this.dragToRotateScene();
      } else {
        this.panViewByMouseMove();
      }
    } else {
      if (this.viewer.pressedKeys.has(Keys.Shift)) {
        this.panViewByMouseMove();
      } else if (this.viewer.pressedKeys.has(Keys.Control)) {
        this.zoomViewByMouseButton();
      } else {
        this.dragToRotateScene();
      }
    }
  }

  sceneMouseWheelHandler(): void {
    if (!this.enabled) return;

    this.zoomViewByMouseWheel();
  }

  zoomViewByMouseWheel(): void {
    if (!this.enabled) return;

    let s = this.viewer.originDistance - this.viewer.mouse.wheeldelta / 3000;
    if (s > this.maximalZoomDistance) s = this.maximalZoomDistance; else if (s < this.minimalZoomDistance) s = this.minimalZoomDistance;
    this.viewer.originDistance = s;
    this.scene.requireUpdateFrame();
  }

  zoomViewByMouseButton(): void {
    if (!this.enabled) return;

    let s = this.viewer.originDistance - (this.viewer.mouse.movement.x + this.viewer.mouse.movement.y) / -100;
    if (s > this.maximalZoomDistance) s = this.maximalZoomDistance; else if (s < this.minimalZoomDistance) s = this.minimalZoomDistance;
    this.viewer.originDistance = s;
    this.scene.requireUpdateFrame();
  }

  panViewByMouseMove(): void {
    if (!this.enabled) return;

    this.viewer.moveOffset(this.viewer.mouse.movement.x / 50, -this.viewer.mouse.movement.y / 50, 0);
  }

  limitViewAngleScope(): void {
    if (!this.enabled) return;

    if (this.viewer.angle.x < this.minRotateX) this.viewer.angle.x = this.minRotateX;
    if (this.viewer.angle.x > this.maxRotateX) this.viewer.angle.x = this.maxRotateX;

    if (this.viewer.angle.y < 0) this.viewer.angle.y += 360;
    if (this.viewer.angle.y > 360) this.viewer.angle.y -= 360;
  }

  dragToRotateScene(): void {
    if (!this.enabled) return;

    const movement = this.viewer.mouse.movement;

    this.viewer.angle.y += movement.x;
    this.viewer.angle.x += movement.y;

    this.limitViewAngleScope();
    this.scene.requireUpdateFrame();
  }

  dragAcceleration(): void {
    if (!this.enabled) return;
    if (this.dragBehavior === "pan") return;
    if (!this.enableDragAcceleration) return;

    const scene = this.scene, viewer = this.viewer;

    if ((Date.now() - this.startDragTime) < 300) {
      performMovementAccelerationAnimation(scene,
        this.dragAccelerationIntensity, this.dragAccelerationAttenuation, (xdiff: number, ydiff: number) => {
          viewer.angle.y += xdiff;
          viewer.angle.x += ydiff;

          this.limitViewAngleScope();
        });
    }
  }
}
