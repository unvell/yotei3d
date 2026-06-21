import { Color3 } from "@jingwood/graphics-math";
import { SceneObject } from "../scene/object.js";
import { PlaneMesh } from "../scene/shapes.js";
import { Material } from "../scene/material";

// GroundFog — drifting low-lying mist.
//
// A few large horizontal plane "layers" stacked just above the ground, each
// rendered by the procedural "groundfog" shader. The fog pattern is animated
// noise that slowly flows in the wind direction; the stacked layers drift at
// slightly different speeds to give a soft volumetric parallax near the floor.
//
// Usage:
//   const fog = new GroundFog({ size: 80, drift: [0.6, 0.2] });
//   scene.add(fog);                         // add after scene geometry
//   scene.on("frame", () => fog.update());  // animate the flow
//   scene.animation = true;

export interface GroundFogMaterialOptions {
  color?: number[] | Color3;
  opacity?: number;
  density?: number;
  noiseScale?: number;
  flow1?: number[];
  flow2?: number[];
}

// GroundFogMaterial owns the "groundfog" shader selection plus the per-layer
// procedural-noise uniforms (coverage + the two animated flow offsets). The
// flow offsets are mutated each frame by GroundFog.update().
export class GroundFogMaterial extends Material {
  opacity = 0.5;
  density = 0.55;
  noiseScale = 0.045;
  flow1: number[] = [0, 0];
  flow2: number[] = [0, 0];

  override get shaderName(): string {
    return "groundfog";
  }

  constructor(options: GroundFogMaterialOptions = {}) {
    super();
    // fog must never cast shadows (it would splat flat planes into the map)
    this.castShadow = false;

    if (options.color !== undefined) this.color = options.color;
    if (typeof options.opacity === "number") this.opacity = options.opacity;
    if (typeof options.density === "number") this.density = options.density;
    if (typeof options.noiseScale === "number") this.noiseScale = options.noiseScale;
    if (Array.isArray(options.flow1)) this.flow1 = options.flow1;
    if (Array.isArray(options.flow2)) this.flow2 = options.flow2;
  }

  override copyFrom(mat: any): void {
    super.copyFrom(mat);
    if (typeof mat.opacity === "number") this.opacity = mat.opacity;
    if (typeof mat.density === "number") this.density = mat.density;
    if (typeof mat.noiseScale === "number") this.noiseScale = mat.noiseScale;
    if (Array.isArray(mat.flow1)) this.flow1 = mat.flow1.slice();
    if (Array.isArray(mat.flow2)) this.flow2 = mat.flow2.slice();
  }
}

export interface GroundFogOptions {
  size: number;
  layers: number;
  baseHeight: number;
  layerGap: number;
  color: number[];
  opacity: number;
  density: number;
  noiseScale: number;
  drift: number[];
  followTarget: any;
}

// A fog layer is a plain plane object carrying a GroundFogMaterial plus the two
// per-layer drift speeds (simulation-only state the shader never reads).
interface FogLayer extends SceneObject {
  mat: GroundFogMaterial;
  _speed1: number;
  _speed2: number;
}

export class GroundFog extends SceneObject {
  options: GroundFogOptions;
  private _layers: FogLayer[];
  private _lastTime = 0;

  constructor(options: Partial<GroundFogOptions> = {}) {
    super();

    const opt = this.options = Object.assign({
      size: 80,            // horizontal extent of the fog sheet (world units)
      layers: 3,           // stacked planes — more = thicker, softer volume
      baseHeight: 0.4,     // height of the lowest layer
      layerGap: 0.9,       // vertical spacing between layers
      color: [0.62, 0.66, 0.72],
      opacity: 0.5,        // alpha of the lowest layer (upper layers thinner)
      density: 0.55,       // coverage, 0 (wispy) .. 1 (solid)
      noiseScale: 0.045,   // world units -> noise frequency (smaller = larger blobs)
      drift: [0.6, 0.25],  // world units/sec the fog flows toward [x, z]
      followTarget: null,  // optional object/camera; sheet tracks its x/z
    }, options) as GroundFogOptions;

    // like rain, fog must never cast shadows
    this.castShadow = false;

    this._layers = [];
    const n = opt.layers;

    for (let i = 0; i < n; i++) {
      const t = n > 1 ? i / (n - 1) : 0;   // 0 = bottom .. 1 = top

      const layer = new SceneObject() as FogLayer;
      layer.addMesh(new PlaneMesh(1, 1));
      layer.scale.set(opt.size, 1, opt.size);
      layer.location.y = opt.baseHeight + i * opt.layerGap;
      layer.castShadow = false;

      // GroundFogMaterial selects the "groundfog" shader and carries the layer's
      // procedural-noise parameters. flow1/flow2 get randomised start offsets so
      // layers don't move in lockstep; they're advanced in update().
      layer.mat = new GroundFogMaterial({
        color: opt.color,
        opacity: opt.opacity * (1.0 - 0.45 * t),   // upper layers fade out
        density: opt.density,
        noiseScale: opt.noiseScale,
        flow1: [this._rand(0, 10), this._rand(0, 10)],
        flow2: [this._rand(0, 10), this._rand(0, 10)],
      });

      // per-layer drift speeds (simulation-only; not read by the shader)
      layer._speed1 = 1.0 + 0.25 * i;
      layer._speed2 = -0.65 - 0.18 * i;

      this.add(layer);
      this._layers.push(layer);
    }
  }

  private _rand(a: number, b: number): number { return a + Math.random() * (b - a); }

  // Advance the drifting flow. Call once per rendered frame.
  update(): void {
    const now = (typeof performance !== "undefined" ? performance.now() : Date.now());
    let dt = this._lastTime ? (now - this._lastTime) / 1000 : 0.016;
    this._lastTime = now;
    if (dt > 0.05) dt = 0.05;

    const o = this.options;
    const ns = o.noiseScale;
    // world drift converted into noise-space units (matches base = worldXZ * noiseScale)
    const dx = o.drift[0] * ns, dz = o.drift[1] * ns;

    const target = o.followTarget;
    if (target && target.location) {
      this.location.x = target.location.x;
      this.location.z = target.location.z;
    }

    for (const layer of this._layers) {
      const m = layer.mat;
      m.flow1[0] += dx * layer._speed1 * dt;
      m.flow1[1] += dz * layer._speed1 * dt;
      m.flow2[0] += dx * layer._speed2 * dt;
      m.flow2[1] += dz * layer._speed2 * dt;
    }
  }
}
