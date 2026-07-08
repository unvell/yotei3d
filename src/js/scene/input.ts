////////////////////////////////////////////////////////////////////////////////
// Yotei3D - Web3D Engine
// Copyright(c) 2024-2025 Jingwood, All Rights Reserved.
////////////////////////////////////////////////////////////////////////////////

// InputManager — the engine's input hub. It owns mouse / keyboard / touch state
// and dispatches the corresponding events onto the current scene. It carries no
// camera transform anymore: camera posing is done entirely by CameraController
// implementations acting on a Camera (see view/cameracontroller.ts). This class
// replaces the former `Viewer` (which mixed input with a global orbit rig).

import { Vec3 } from "@/math";
import { invokeIfExist } from "../utility/utility";
import { ProjectionMethods } from "../render/renderer";

export const OperationModes = {
  None: 0,
  DragReady: 1,
  Dragging: 2,
}

export const MouseButtons = {
  None: 0,
  Left: 1,
  Middle: 2,
  Right: 3,
  Touch0: 10,
  Touch1: 11,
  Touch2: 12,
  Touch3: 13,
  Touch4: 14,
  Touch5: 15,
}

export const Keys = {
  Backspace: 8, Tab: 9, Enter: 13,
  Shift: 16, Control: 17, Alt: 18,

  Escape: 27, Space: 32, PageUp: 33, PageDown: 34,
  End: 35, Home: 36,
  Left: 37, Up: 38, Right: 39, Down: 40,
  Insert: 45, Delete: 46,

  D0: 48, D1: 49, D2: 50, D3: 51, D4: 52,
  D5: 53, D6: 54, D7: 55, D8: 56, D9: 57,

  A: 65, B: 66, C: 67, D: 68, E: 69, F: 70, G: 71,
  H: 72, I: 73, J: 74, K: 75, L: 76, M: 77, N: 78,
  O: 79, P: 80, Q: 81, R: 82, S: 83, T: 84,
  U: 85, V: 86, W: 87, X: 88, Y: 89, Z: 90,

  MacCommand_Firefox: 224, MacCommand_Opera: 17,
  MacCommand_Left: 91, MacCommand_Right: 93,

  Multiply: 106, Add: 107, Subtract: 108, Divide: 111,

  Backquote: 192,
}

// Camera orientation presets (kept for convenience; consumed by camera-facing
// helpers, not by the input layer itself).
export const Faces = {
  Front: new Vec3(0, 0, 0),
  Back: new Vec3(0, 180, 0),
  Top: new Vec3(90, 0, 0),
  Bottom: new Vec3(-90, 0, 0),
  Left: new Vec3(0, -90, 0),
  Right: new Vec3(0, 90, 0),
}

interface Point { x: number; y: number; }

interface InputMouse {
  position: Point;
  movement: Point;
  dragstart: Point;
  dragend: Point;
  wheeldelta: number;
  pressedButtons: Set<number>;
}

export class InputManager {
  renderer: any;

  firstMovementUpdate: boolean;

  mouse: InputMouse;
  touch: { fingers: number };

  pressedKeys: Set<number>;
  operationMode: number;

  constructor(renderer: any) {
    this.renderer = renderer;

    this.firstMovementUpdate = true;

    // mouse or touch
    this.mouse = {
      // current mouse position
      position: { x: 0, y: 0 },

      // amount of mouse movement difference
      movement: { x: 0, y: 0 },

      // draging start and end position
      dragstart: { x: 0, y: 0 },
      dragend: { x: 0, y: 0 },

      // mouse wheel
      wheeldelta: 0,

      // current pressed mouse buttons
      pressedButtons: new Set<number>(),
    };

    this.touch = {
      fingers: 0,
    };

    this.pressedKeys = new Set<number>();
    this.operationMode = OperationModes.None;

    const input = this;

    const surface = renderer.surface;

    if (typeof surface === "object") {
      surface.tabIndex = -1;

      if (typeof renderer.options.canvasAutoFocus !== "boolean" || renderer.options.canvasAutoFocus === true) {
        surface.focus();
      }

      surface.addEventListener("mousedown", function (e: MouseEvent) {
        const mouse = input.mouse;
        const clientRect = surface.getBoundingClientRect();
        mouse.position.x = e.clientX - clientRect.left;
        mouse.position.y = e.clientY - clientRect.top;

        mouse.movement.x = 0;
        mouse.movement.y = 0;

        mouse.dragstart.x = mouse.position.x;
        mouse.dragstart.y = mouse.position.y;

        switch (e.button) {
          case 0: mouse.pressedButtons.add(MouseButtons.Left); break;
          case 1: mouse.pressedButtons.add(MouseButtons.Middle); break;
          case 2: mouse.pressedButtons.add(MouseButtons.Right); break;
        }

        input.operationMode = OperationModes.DragReady;

        input.performSceneMouseDown();
      });

      surface.addEventListener("mousemove", function (this: any, e: MouseEvent) {
        const mouse = input.mouse;
        const scene = input.renderer.currentScene;

        if (input.operationMode == OperationModes.DragReady) {
          if (Math.abs(mouse.position.x - mouse.dragstart.x) > 3
            || Math.abs(mouse.position.y - mouse.dragstart.y) > 3) {

            if (scene) {
              scene.begindrag();
            }

            input.operationMode = OperationModes.Dragging;
          }
        }

        if (input.operationMode === OperationModes.None) {
          const clientRect = surface.getBoundingClientRect();
          const client = {
            x: e.clientX - clientRect.left,
            y: e.clientY - clientRect.top
          }
          if (input.firstMovementUpdate) {
            mouse.movement.x = 0;
            mouse.movement.y = 0;
            input.firstMovementUpdate = false;
          } else {
            mouse.movement.x = client.x - mouse.position.x;
            mouse.movement.y = client.y - mouse.position.y;
          }

          mouse.position.x = client.x;
          mouse.position.y = client.y;

          if (scene) {
            scene.mousemove({ position: mouse.position, movement: mouse.movement });
          }
        }
      });

      surface.addEventListener("mousewheel", function (e: any) {
        input.mouse.wheeldelta = e.wheelDelta;

        const scene = input.renderer.currentScene;

        if (scene && typeof scene.onmousewheel === "function") {
          scene.onmousewheel();
          e.preventDefault();
        }
      }, { passive: false });

      surface.addEventListener('keydown', function (e: KeyboardEvent) {
        input.pressedKeys.add(e.keyCode);

        let isProcessed = false;

        const scene = input.renderer.currentScene;

        if (scene) {
          const renderer = input.renderer;

          if (renderer.options.debugMode) {
            if ((e.keyCode == Keys.Z
              || e.keyCode == Keys.P)
              && !input.pressedKeys.has(Keys.Control)
              && !input.pressedKeys.has(Keys.Shift)
              && !input.pressedKeys.has(Keys.MacCommand_Firefox)
              && !input.pressedKeys.has(Keys.MacCommand_Opera)
              && !input.pressedKeys.has(Keys.MacCommand_Left)
              && !input.pressedKeys.has(Keys.MacCommand_Right)) {

              switch (e.keyCode) {
                case Keys.Z:
                  renderer.wireframe = !renderer.wireframe;
                  break;

                case Keys.P:
                  if (scene.mainCamera) {
                    if (scene.mainCamera.projectionMethod == ProjectionMethods.Persp) {
                      scene.mainCamera.projectionMethod = ProjectionMethods.Ortho;
                    } else {
                      scene.mainCamera.projectionMethod = ProjectionMethods.Persp;
                    }
                  } else {
                    if (renderer.options.perspective.method == ProjectionMethods.Persp) {
                      renderer.options.perspective.method = ProjectionMethods.Ortho;
                    } else {
                      renderer.options.perspective.method = ProjectionMethods.Persp;
                    }
                  }
                  break;
              }

              scene.requireUpdateFrame();
              isProcessed = true;
            }

            if (input.pressedKeys.has(Keys.Shift)
              && input.pressedKeys.has(Keys.Control)) {

              if (e.keyCode == Keys.K) {
                renderer.debugger.showDebugPanel = !renderer.debugger.showDebugPanel;
                scene.requireUpdateFrame();
                isProcessed = true;
              }

              if (e.keyCode == Keys.B) {
                renderer.debugger.showObjectBoundingBox = !renderer.debugger.showObjectBoundingBox;
                scene.requireUpdateFrame();
                isProcessed = true;
              }
            }
          }

          isProcessed = isProcessed || scene.keydown(e.keyCode);
        }

        // FIXME: integrated 2D 3D event system
        if (input.renderer.current2DScene) {
          isProcessed = isProcessed || input.renderer.current2DScene.keydown(e.keyCode);
        }

        if (isProcessed) {
          e.preventDefault();
          return false;
        }
      });

      surface.addEventListener("blur", function (e: FocusEvent) {
        input.pressedKeys.clear();
        input.mouse.pressedButtons.clear();
      });

      window.addEventListener("blur", function (e) {
        input.pressedKeys.clear();
        input.mouse.pressedButtons.clear();
      });

      window.addEventListener('keyup', function (e: KeyboardEvent) {
        input.pressedKeys.delete(e.keyCode);

        const scene = input.renderer.currentScene;

        if (scene) {
          invokeIfExist(scene, "keyup", e.keyCode);
        }
      });

      surface.addEventListener("touchstart", function (e: TouchEvent) {
        if (typeof e.touches === "object") {
          const t = e.touches[0];

          const mouse = input.mouse;
          const clientRect = surface.getBoundingClientRect();

          mouse.position.x = t.clientX - clientRect.left;
          mouse.position.y = t.clientY - clientRect.top;

          mouse.movement.x = 0;
          mouse.movement.y = 0;

          mouse.dragstart.x = mouse.position.x;
          mouse.dragstart.y = mouse.position.y;

          input.operationMode = OperationModes.DragReady;
          input.touch.fingers = e.touches.length;

          input.performSceneMouseDown();
        }
      }, { passive: true });

    }

    window.addEventListener("mousemove", function (e: MouseEvent) {
      const mouse = input.mouse;
      const clientRect = surface.getBoundingClientRect();
      const client = {
        x: e.clientX - clientRect.left,
        y: e.clientY - clientRect.top
      }
      if (input.firstMovementUpdate) {
        mouse.movement.x = 0;
        mouse.movement.y = 0;
        input.firstMovementUpdate = false;
      } else {
        mouse.movement.x = client.x - mouse.position.x;
        mouse.movement.y = client.y - mouse.position.y;
      }

      mouse.position.x = client.x;
      mouse.position.y = client.y;

      switch (input.operationMode) {
        case OperationModes.Dragging:
          if (input.renderer.currentScene) {
            input.renderer.currentScene.drag();
          }

          // FIXME: integrated 2D 3D event system
          if (input.renderer.current2DScene) {
            input.renderer.current2DScene.drag();
          }
          break;
      }
    });

    window.addEventListener("mouseup", function (e: MouseEvent) {
      const mouse = input.mouse;

      input.performSceneMouseUp();

      switch (e.button) {
        case 0: mouse.pressedButtons.delete(MouseButtons.Left); break;
        case 1: mouse.pressedButtons.delete(MouseButtons.Middle); break;
        case 2: mouse.pressedButtons.delete(MouseButtons.Right); break;
      }

      input.operationMode = OperationModes.None;
    });

    window.addEventListener("touchmove", function (e: TouchEvent) {
      if (typeof e.touches === "object") {
        const t = e.touches[0];

        const mouse = input.mouse;
        const clientRect = surface.getBoundingClientRect();
        const client = {
          x: t.clientX - clientRect.left,
          y: t.clientY - clientRect.top
        }
        mouse.movement.x = (client.x - mouse.position.x);
        mouse.movement.y = (client.y - mouse.position.y);

        mouse.position.x = client.x;
        mouse.position.y = client.y;

        switch (input.operationMode) {
          case OperationModes.DragReady: {
            const scene = input.renderer.currentScene;

            if (scene) {
              scene.begindrag();
            }

            e.preventDefault();

            input.operationMode = OperationModes.Dragging;
            break;
          }

          case OperationModes.Dragging: {
            const scene = input.renderer.currentScene;

            if (scene) {
              scene.drag();
            }

            e.preventDefault();
            break;
          }
        }
      }
    }, { passive: false });

    window.addEventListener("touchend", function (e: TouchEvent) {
      if (e.touches) {
        input.touch.fingers = e.touches.length;
      } else {
        input.touch.fingers = 0;
      }

      input.performSceneMouseUp();

      input.operationMode = OperationModes.None;
    });

    window.oncontextmenu = function (e) {
      e.preventDefault();
      return false;
    };
  }

  performSceneMouseDown(): void {
    const scene = this.renderer.currentScene;

    if (scene) {
      const ret = scene.mousedown(this.mouse.position);

      if (typeof ret !== "undefined" && ret) {
        return;
      }
    }
  }

  performSceneMouseUp(): void {
    const scene = this.renderer.currentScene;

    switch (this.operationMode) {
      default:
        if (scene) {
          if (this.mouse.pressedButtons.size > 0) {
            scene.mouseup(this.mouse.position);
          }
        }
        break;

      case OperationModes.Dragging:
        if (scene) {
          scene.enddrag(this.mouse.position);
        }
        break;
    }
  }

  setCursor(type: string): void {
    this.renderer.surface.style.cursor = type;
  }
}
