import { Vec3, Matrix4 } from "@/math";
import { Keys, MouseButtons } from "../scene/viewer";
import { invokeIfExist } from "../utility/utility";

export class FPSController {
  scene: any;
  renderer: any;
  options: any;

  /** optional callback, invoked after a first-person move (if assigned) */
  oncameramove?: (...args: any[]) => any;

  static defaultOptions() {
    return {
      moveSpeed: 0.2,
    };
  }

  constructor(scene: any, options?: any) {
    this.scene = scene;
    this.renderer = scene.renderer;
    this.options = { ...FPSController.defaultOptions(), ...options };

    const viewer = this.renderer.viewer;
    let movementDetectingTimer: any = null;

    scene.on("keydown", () => {
      if (!movementDetectingTimer) {
        movementDetectingTimer = setInterval(() => {
          this.detectFirstPersonMove();
        }, 10);
      }
    });

    scene.on("keyup", () => {
      if (viewer.pressedKeys.size === 0) {
        clearInterval(movementDetectingTimer);
        movementDetectingTimer = null;
      }
    });

    scene.on("begindrag", () => {
      this.renderer.viewer.setCursor("none");
    });

    scene.on("enddrag", () => {
      this.renderer.viewer.setCursor("auto");
    });

    scene.on("drag", () => {
      const camera = scene.mainCamera;

      if (viewer && camera) {
        if (viewer.mouse.pressedButtons.has(MouseButtons.Left)
          || viewer.touch.fingers == 1) {

          if (viewer.pressedKeys.has(Keys.Shift)) {
            this.dragToMoveCamera();
          } else {
            this.dragToRotateCamera();
          }
        }

        if (viewer.mouse.pressedButtons.has(MouseButtons.Right)
          || viewer.touch.fingers == 2) {
          this.dragToMoveCamera();
        }
      }
    });
  }

  dragToRotateCamera() {
    var viewer = this.renderer.viewer;
    var camera = this.scene.mainCamera;

    camera.angle.x -= viewer.mouse.movement.y * 200 / viewer.renderer.renderSize.height;
    camera.angle.y -= viewer.mouse.movement.x * 200 / viewer.renderer.renderSize.width;

    if (camera.angle.x < -80) camera.angle.x = -80;
    else if (camera.angle.x > 80) camera.angle.x = 80;

    camera.angle.y = (camera.angle.y + 360) % 360;

    this.scene.requireUpdateFrame();
  }

  dragToMoveCamera() {
    var viewer = this.renderer.viewer;
    var camera = this.scene.mainCamera;

    const m = new Matrix4();
    m.loadIdentity().rotate(camera.angle);

    var transformedDir = new Vec3(
      viewer.mouse.movement.x * 50 / viewer.renderer.renderSize.width, 0,
      viewer.mouse.movement.y * 50 / viewer.renderer.renderSize.height).mulMat(m);

    camera.location.x += transformedDir.x;
    camera.location.z += transformedDir.z;

    camera.onmove();

    this.scene.requireUpdateFrame();
  }

  detectFirstPersonMove() {
    const m = new Matrix4(), dir = new Vec3();

    var scene = this.scene;
    var viewer = this.renderer.viewer;

    if (scene && scene.mainCamera) {
      var camera = scene.mainCamera;

      dir.set(0, 0, 0);

      if (viewer.pressedKeys.has(Keys.A)) {
        dir.x = -1;
      } else if (viewer.pressedKeys.has(Keys.D)) {
        dir.x = 1;
      }

      if (viewer.pressedKeys.has(Keys.W)
        || viewer.pressedKeys.has(Keys.Up)) {
        if (viewer.pressedKeys.has(Keys.Shift)) {
          camera.location.y += this.options.moveSpeed;
          scene.requireUpdateFrame();
        } else {
          dir.z = -1;
        }
      } else if (viewer.pressedKeys.has(Keys.S)
        || viewer.pressedKeys.has(Keys.Down)) {
        if (viewer.pressedKeys.has(Keys.Shift)) {
          camera.location.y -= this.options.moveSpeed;
          scene.requireUpdateFrame();
        } else {
          dir.z = 1;
        }
      }

      if (viewer.pressedKeys.has(Keys.Left)) {
        camera.angle.y += this.options.moveSpeed * 10;
        scene.requireUpdateFrame();
      } else if (viewer.pressedKeys.has(Keys.Right)) {
        camera.angle.y -= this.options.moveSpeed * 10;
        scene.requireUpdateFrame();
      }

      camera.angle.y = (camera.angle.y + 360) % 360;

      if (dir.x !== 0 || dir.y !== 0 || dir.z !== 0) {

        m.loadIdentity().rotate(camera.angle);

        var transformedDir = dir.mulMat(m);

        transformedDir.y = 0;
        transformedDir = transformedDir.normalize();

        // don't allow to change y if you don't want fly :)
        camera.move(transformedDir.x * this.options.moveSpeed, 0, transformedDir.z * this.options.moveSpeed);

        invokeIfExist(this, "oncameramove");
      }
    }
  }
}
