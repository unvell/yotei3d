
////////////////////////// Camera //////////////////////////

import { Vec3, BoundingBox3D } from "@/math";
import { EventDispatcher } from '../utility/event';
import { Size } from '../render/draw2d';
import { Mesh } from "../webgl/mesh";
import { SceneObject } from "./object";
import { ProjectionMethods } from "../render/renderer";

export class CameraMesh extends Mesh {
  static VertexBuffer = new Float32Array([-0.5, -0.5, -0.375, 0.0, 0.0, 0.625, -0.5,
    0.5, -0.375, -0.5, 0.5, -0.375, 0.0, 0.0, 0.625, 0.5, 0.5, -0.375, 0.5, -0.5, -0.375,
    0.0, 0.0, 0.625, -0.5, -0.5, -0.375, 0.5, 0.5, -0.375, 0.0, 0.0, 0.625, 0.5, -0.5,
    -0.375, 0.0, 0.0, 0.104, -0.5, 0.5, -0.375, 0.5, 0.5, -0.375, 0.5, -0.5, -0.375, 0.0,
    0.0, 0.104, 0.5, 0.5, -0.375, -0.5, 0.5, -0.375, 0.0, 0.0, 0.104, -0.5, -0.5, -0.37,
    -0.5, -0.5, -0.375, 0.0, 0.0, 0.104, 0.5, -0.5, -0.375, -0.894, 0.0, 0.447, -0.894,
    0.0, 0.447, -0.894, 0.0, 0.447, 0.0, 0.894, 0.447, 0.0, 0.894, 0.447, 0.0, 0.894,
    0.447, 0.0, -0.894, 0.447, 0.0, -0.894, 0.447, 0.0, -0.894, 0.447, 0.894, 0.0,
    0.447, 0.894, 0.0, 0.447, 0.894, 0.0, 0.447, -0.0, -0.692, -0.722, -0.0, -0.692,
    -0.722, -0.0, -0.692, -0.722, -0.692, 0.0, -0.722, -0.692, 0.0, -0.722, -0.692,
    0.0, -0.722, 0.692, 0.0, -0.722, 0.692, 0.0, -0.722, 0.692, 0.0, -0.722, -0.0, 0.692,
    -0.722, -0.0, 0.692, -0.722, -0.0, 0.692, -0.722]);

  constructor() {
    super();

    (this as any).vertexBuffer = CameraMesh.VertexBuffer;

    (this as any).meta = {
      vertexCount: 24,
      normalCount: 24,
      texcoordCount: 0,
    };
  }
}

export class Camera extends SceneObject {
  viewSize: Size;
  fieldOfView: number;
  projectionMethod: number;
  renderTexture: any;
  filters: any[];

  // --- Output / post-processing (camera owns the "how the scene is viewed"
  // half of the pipeline; see docs/RENDERING.md). Scene radiance is rendered
  // linear-HDR; these control the single 2D post chain that resolves it. ---
  exposure: number;             // linear-HDR multiplier before tone-map
  gamma: number;                // display-encode factor (pow(c, gamma))
  toneMapping: string;          // 'auto' (tone-map when HDR target) | 'none'
  bloom: {
    enabled: boolean;
    intensity: number;          // composite weight of the blurred bright-pass
    threshold: number;          // bloom buffer resolution scale (build-time)
    luminanceThreshold: number; // HDR bright-pass cutoff
  };
  _resolutionRatio: number;     // 3D HDR render scale (0.5 = half-res, cheap)

  static meshInstance: CameraMesh | null = null;

  constructor() {
    super();

    // camera is invisible
    this.visible = false;

    // render result image size
    this.viewSize = new Size(800, 600);

    // Field of View (AFOV)
    this.fieldOfView = 75;

    // Projection Method (Persp/Ortho)
    this.projectionMethod = ProjectionMethods.Persp;

    // keep only one camera mesh instance
    if (!Camera.meshInstance) {
      Camera.meshInstance = new CameraMesh();
    }

    // add mesh into camera object
    this.addMesh(Camera.meshInstance);

    // render scene to texture
    this.renderTexture = null;

    // post process filters
    this.filters = [];

    // output / post defaults (see docs/RENDERING.md §4)
    this.exposure = 1.0;
    this.gamma = 2.2;   // display gamma; final encode is pow(c, 1/gamma) ~ sRGB
    this.toneMapping = 'auto';
    this.bloom = {
      enabled: true,
      intensity: 0.35,
      threshold: 0.1,
      luminanceThreshold: 1.0,
    };
    this._resolutionRatio = 1.0;
  }

  // 3D render scale. Changing it resizes the HDR pipeline targets, so the
  // pipeline must be rebuilt — done here when the camera is attached to a scene.
  get resolutionRatio(): number { return this._resolutionRatio; }
  set resolutionRatio(v: number) {
    if (this._resolutionRatio !== v) {
      this._resolutionRatio = v;
      const renderer = this.scene && this.scene.renderer;
      if (renderer && typeof renderer.createPipeline === 'function') {
        renderer.createPipeline();
        this.scene.requireUpdateFrame();
      }
    }
  }

  calcVisibleDistanceToObject(obj: any, out?: any): number {
    if (!this.scene || !this.scene.renderer) {
      throw "camera must be added into a scene before use this function";
    }

    const renderer = this.scene.renderer;
    let target, size, bbox = obj.getBounds();

    if (bbox) {
      bbox = new BoundingBox3D(bbox);
      target = bbox.origin;
      size = Math.max(bbox.size.x, bbox.size.y, bbox.size.z) * 2.0;
    } else {
      target = obj.worldLocation;
      size = 1;
    }

    if (typeof out === "object") {
      out.targetLocation = target;
    }

    const distance = size * 0.5 + ((size / renderer.aspectRate) / Math.tan((this.fieldOfView) * Math.PI / 180));

    return distance;
  }

  focusAt(objectOrPoint: any, options: any = {
    distance: 1,
  }): void {

    let targetMovePos, targetLookatPos, vectorToTarget, distanceToTarget;

    const worldpos = this.worldLocation;

    if (objectOrPoint instanceof SceneObject) {
      const out: any = {};
      distanceToTarget = this.calcVisibleDistanceToObject(objectOrPoint, out);
      targetLookatPos = out.targetLocation;
      vectorToTarget = Vec3.sub(targetLookatPos, worldpos);
    } else if (objectOrPoint instanceof Vec3) {
      targetLookatPos = objectOrPoint;
      vectorToTarget = Vec3.sub(targetLookatPos, worldpos);
      distanceToTarget = Vec3.length(vectorToTarget);
    } else if (typeof objectOrPoint === "object") {
      const { x, y, z } = objectOrPoint;
      targetLookatPos = new Vec3(x, y, z);
      vectorToTarget = Vec3.sub(targetLookatPos, worldpos);
      distanceToTarget = Vec3.length(vectorToTarget);
    } else {
      throw Error("invalid target, type is not recognized: " + objectOrPoint);
    }

    if (typeof options.distance !== "undefined" && !isNaN(options.distance)) {
      distanceToTarget -= options.distance;
    } else {
      distanceToTarget -= 1;
    }

    const dir = Vec3.normalize(vectorToTarget);
    targetMovePos = Vec3.add(worldpos, Vec3.mul(dir, distanceToTarget));

    if (options.animation === false) {
      this.location = targetMovePos;
      this.lookAt(targetLookatPos, options.lookup);

      const scene = this.scene;
      if (scene) scene.requireUpdateFrame();
    } else {
      this.moveTo(targetMovePos, {
        duration: options.duration || 0.8,
        effect: options.effect || "smooth",
        lookdir: targetLookatPos.sub(worldpos),
        lookup: options.lookup || Vec3.up,
      }, () => {
        if (typeof options.onfinish === 'function') {
          options.onfinish(targetLookatPos)
        }
      });
    }
  }

  /*
   * Calc the AFOV (angle in degrees) by specified focus length and sensor size.
   */
  static calcFov(focusLength: number, sensorSize?: number): number {
    if (typeof sensorSize === "undefined") {
      sensorSize = 35;
    }

    return 2 * Math.atan2(sensorSize, 2 * focusLength) * 180 / Math.PI;
  }
}

new EventDispatcher(Camera).registerEvents("onmove");
