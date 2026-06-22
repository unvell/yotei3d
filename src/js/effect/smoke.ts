import { Color3 } from "@/math";
import { ParticleObject } from "../scene/object.js";
import { ParticleMesh } from "../webgl/mesh.js";
import { Material } from "../scene/material";
import { arraySet } from "../utility/utility";

// Smoke — a self-contained rising-smoke effect.
//
// A small emitter releases soft grey puffs that rise slowly, drift with the
// wind, swirl (a per-puff sine sway), swell as they climb and fade in then out
// over their lifespan before recycling. Rendered by the "smoke" shader with
// straight alpha blending. Designed to sit on top of a Fire emitter to make a
// campfire, but works standalone (chimney, smouldering, fog wisps).
//
// Usage:
//   const smoke = new Smoke({ radius: 0.4, baseY: 2.5 });
//   scene.add(smoke);                         // add after scene geometry
//   scene.on("frame", () => smoke.update());  // drive the simulation
//   scene.animation = true;

export interface SmokeMaterialOptions {
  color?: number[] | Color3;
  opacity?: number;    // overall smoke density
  sizeScale?: number;  // reference depth for perspective puff sizing
  maxSize?: number;    // clamp for very near puffs
}

// SmokeMaterial owns the "smoke" shader selection plus the grey tint and the
// appearance uniforms the SmokeShader reads. The per-puff life alpha is carried
// in the mesh colour buffer, not the material.
export class SmokeMaterial extends Material {
  opacity = 0.45;
  sizeScale = 20;
  maxSize = 256;

  override get shaderName(): string {
    return "smoke";
  }

  constructor(options: SmokeMaterialOptions = {}) {
    super();
    this.castShadow = false; // puffs must not cast shadows (see Snow/Rain)
    this.color = [0.5, 0.5, 0.52];

    if (options.color !== undefined) this.color = options.color;
    if (typeof options.opacity === "number") this.opacity = options.opacity;
    if (typeof options.sizeScale === "number") this.sizeScale = options.sizeScale;
    if (typeof options.maxSize === "number") this.maxSize = options.maxSize;
  }

  override copyFrom(mat: any): void {
    super.copyFrom(mat);
    if (typeof mat.opacity === "number") this.opacity = mat.opacity;
    if (typeof mat.sizeScale === "number") this.sizeScale = mat.sizeScale;
    if (typeof mat.maxSize === "number") this.maxSize = mat.maxSize;
  }
}

export interface SmokeOptions {
  count: number;
  radius: number;       // emitter radius
  baseY: number;        // height the smoke starts at (e.g. the flame tip)
  height: number;       // rise distance over a puff's life
  riseSpeed: number;    // base upward speed, units per second
  riseVariance: number; // ± fraction of rise speed randomised per puff
  wind: number[];       // horizontal drift [x, z], units per second
  swirl: number;        // horizontal swirl amplitude (world units)
  swirlFreq: number;    // swirl speed
  spread: number;       // how far puffs wander outward as they rise
  sizeStart: number;    // puff size (px) at birth
  sizeEnd: number;      // puff size (px) at death (smoke swells as it rises)
  color: number[];      // grey tint
  opacity: number;      // overall density
  sizeScale: number;
  maxSize: number;
  followTarget: any;
}

export class Smoke extends ParticleObject {
  options: SmokeOptions;
  count: number;
  mesh: ParticleMesh;

  private _px: Float32Array;
  private _py: Float32Array;
  private _pz: Float32Array;
  private _ox: Float32Array;     // spawn x offset within the emitter
  private _oz: Float32Array;     // spawn z offset within the emitter
  private _vy: Float32Array;     // rise speed
  private _age: Float32Array;    // seconds lived
  private _life: Float32Array;   // total lifespan in seconds
  private _size: Float32Array;   // per-puff size scale
  private _alpha: Float32Array;  // per-puff peak alpha
  private _phase: Float32Array;  // swirl phase
  private _lastTime = 0;

  constructor(options: Partial<SmokeOptions> = {}) {
    super();

    const opt = this.options = Object.assign({
      count: 260,         // number of puffs
      radius: 0.4,        // emitter radius
      baseY: 2.4,         // start near a flame tip
      height: 8.0,        // rise distance over a life
      riseSpeed: 1.4,     // slow rise
      riseVariance: 0.4,
      wind: [0.5, 0.0],   // gentle lean
      swirl: 0.5,         // lazy swirl
      swirlFreq: 1.2,
      spread: 1.6,        // puffs fan out as they rise
      sizeStart: 22,      // compact near the fire
      sizeEnd: 90,        // billowed out at the top
      color: [0.5, 0.5, 0.52],
      opacity: 0.45,
      sizeScale: 20,
      maxSize: 256,
      followTarget: null, // optional object/camera; emitter tracks its x/z
    }, options) as SmokeOptions;

    const n = this.count = opt.count;

    this.mat = new SmokeMaterial({
      color: opt.color,
      opacity: opt.opacity,
      sizeScale: opt.sizeScale,
      maxSize: opt.maxSize,
    });

    this._px = new Float32Array(n);
    this._py = new Float32Array(n);
    this._pz = new Float32Array(n);
    this._ox = new Float32Array(n);
    this._oz = new Float32Array(n);
    this._vy = new Float32Array(n);
    this._age = new Float32Array(n);
    this._life = new Float32Array(n);
    this._size = new Float32Array(n);
    this._alpha = new Float32Array(n);
    this._phase = new Float32Array(n);

    this.mesh = new ParticleMesh(n);
    this.addMesh(this.mesh);

    for (let i = 0; i < n; i++) {
      this._spawn(i, true);
    }
    this._writeAll();
  }

  private _rand(a: number, b: number): number { return a + Math.random() * (b - a); }

  private _spawn(i: number, initial: boolean): void {
    const o = this.options;
    const ang = this._rand(0, Math.PI * 2);
    const r = o.radius * Math.sqrt(Math.random());
    this._ox[i] = Math.cos(ang) * r;
    this._oz[i] = Math.sin(ang) * r;
    this._vy[i] = o.riseSpeed * this._rand(1 - o.riseVariance, 1 + o.riseVariance);
    this._life[i] = (o.height / Math.max(this._vy[i], 0.001)) * this._rand(0.8, 1.2);
    this._age[i] = initial ? this._rand(0, this._life[i]) : 0;
    this._size[i] = this._rand(0.8, 1.3);
    this._alpha[i] = this._rand(0.6, 1.0);
    this._phase[i] = this._rand(0, Math.PI * 2);
  }

  // fade in off the fire, hold, then fade out toward the top.
  private _fade(f: number): number {
    const fin = Math.min(f / 0.2, 1.0);
    const fout = Math.min((1.0 - f) / 0.5, 1.0);
    return Math.max(fin, 0) * Math.max(fout, 0);
  }

  private _writeOne(i: number): void {
    const n = this.count;
    const o = this.options;
    const vb: any = this.mesh.vertexBuffer;

    const f = Math.min(this._age[i] / Math.max(this._life[i], 0.001), 1.0);

    // per-puff life alpha rides in the colour buffer's red channel (the grey
    // tint comes from the SmokeMaterial colour uniform). All three channels are
    // written so the value is robust regardless of which the shader samples.
    const a = this._fade(f) * this._alpha[i];

    // puffs swell as they rise
    const size = (o.sizeStart + (o.sizeEnd - o.sizeStart) * f) * this._size[i];

    // ParticleMesh layout: [positions][colors][sizes]
    arraySet(vb, i * 3, this._px[i], this._py[i], this._pz[i]);
    arraySet(vb, (n + i) * 3, a, a, a);
    arraySet(vb, n * 6 + i, size);
  }

  private _writeAll(): void {
    for (let i = 0; i < this.count; i++) this._writeOne(i);
    this.mesh.update();
  }

  // Advance the simulation by one frame. Call once per rendered frame.
  update(): void {
    const now = (typeof performance !== "undefined" ? performance.now() : Date.now());
    let dt = this._lastTime ? (now - this._lastTime) / 1000 : 0.016;
    this._lastTime = now;
    if (dt > 0.05) dt = 0.05;

    const o = this.options;
    const n = this.count;

    const t = o.followTarget;
    if (t && t.location) {
      this.location.x = t.location.x;
      this.location.z = t.location.z;
    }

    for (let i = 0; i < n; i++) {
      this._age[i] += dt;
      if (this._age[i] >= this._life[i]) {
        this._spawn(i, false);
      }

      const f = Math.min(this._age[i] / Math.max(this._life[i], 0.001), 1.0);
      this._phase[i] += o.swirlFreq * dt;

      // rise from baseY; drift with the wind and fan outward; swirl laterally
      this._py[i] = o.baseY + this._age[i] * this._vy[i];
      const swirlX = Math.sin(this._phase[i]) * o.swirl * f;
      const swirlZ = Math.cos(this._phase[i] * 1.1) * o.swirl * f;
      this._px[i] = this._ox[i] * (1 + o.spread * f) + o.wind[0] * this._age[i] + swirlX;
      this._pz[i] = this._oz[i] * (1 + o.spread * f) + o.wind[1] * this._age[i] + swirlZ;
    }

    this._writeAll();
  }
}
