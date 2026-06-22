import { ParticleObject } from "../scene/object.js";
import { ParticleMesh } from "../webgl/mesh.js";
import { Material } from "../scene/material";
import { arraySet } from "../utility/utility";

// Fire — a self-contained campfire / torch flame effect.
//
// A small emitter spits glowing embers that rise, flicker (a per-ember sine
// sway), taper inward toward the flame tip and recycle once their lifespan is
// up. Each ember's colour walks a white-hot → yellow → orange → dark-red
// gradient over its life and fades out at the top. Rendered by the "fire"
// shader with additive blending, so overlapping embers build up bright cores —
// pair it with the renderer's bloomEffect for the characteristic glow.
//
// Usage:
//   const fire = new Fire({ radius: 0.5, height: 3 });
//   scene.add(fire);                         // add after scene geometry
//   scene.on("frame", () => fire.update());  // drive the simulation
//   scene.animation = true;

export interface FireMaterialOptions {
  opacity?: number;
  sizeScale?: number;  // reference depth for perspective ember sizing
  maxSize?: number;    // clamp for very near embers
}

// FireMaterial owns the "fire" shader selection plus the appearance uniforms
// the FireShader reads (overall opacity + perspective sizing). The per-ember
// colour is carried in the mesh, not the material.
export class FireMaterial extends Material {
  opacity = 1.0;
  sizeScale = 20;
  maxSize = 128;

  override get shaderName(): string {
    return "fire";
  }

  constructor(options: FireMaterialOptions = {}) {
    super();
    this.castShadow = false; // embers must not cast shadows (see Snow/Rain)

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

export interface FireOptions {
  count: number;
  radius: number;       // emitter radius at the base
  height: number;       // visual flame height (sets ember lifespan vs. rise speed)
  riseSpeed: number;    // base upward speed, units per second
  riseVariance: number; // ± fraction of rise speed randomised per ember
  spread: number;       // outward drift speed at spawn, units per second
  convergence: number;  // 0..1 — how strongly the flame narrows toward the tip
  swayAmp: number;      // horizontal flicker amplitude (world units)
  swayFreq: number;     // flicker speed
  sizeBase: number;     // ember size (px) near the base
  sizeTip: number;      // ember size (px) near the tip
  intensity: number;    // colour multiplier (push >1 to feed the bloom pass)
  colorHot: number[];   // youngest / hottest core colour
  colorMid: number[];   // mid-life colour
  colorCool: number[];  // oldest / coolest colour before it dies
  opacity: number;
  sizeScale: number;
  maxSize: number;
  followTarget: any;
}

export class Fire extends ParticleObject {
  options: FireOptions;
  count: number;
  mesh: ParticleMesh;

  private _px: Float32Array;
  private _py: Float32Array;
  private _pz: Float32Array;
  private _ang: Float32Array;    // fixed azimuth of the ember around the axis
  private _rad: Float32Array;    // spawn radius from the axis
  private _vy: Float32Array;     // rise speed
  private _age: Float32Array;    // seconds lived
  private _life: Float32Array;   // total lifespan in seconds
  private _size: Float32Array;   // per-ember size scale
  private _phase: Float32Array;  // sway phase
  private _swayAmp: Float32Array;
  private _swayFreq: Float32Array;
  private _lastTime = 0;

  constructor(options: Partial<FireOptions> = {}) {
    super();

    const opt = this.options = Object.assign({
      count: 700,         // number of embers
      radius: 0.5,        // emitter radius at the base
      height: 3.0,        // visual flame height
      riseSpeed: 3.2,     // base upward speed, units per second
      riseVariance: 0.4,  // ± fraction of rise speed randomised per ember
      spread: 0.25,       // outward drift at spawn
      convergence: 0.7,   // flame narrows strongly toward the tip
      swayAmp: 0.18,      // flicker amplitude
      swayFreq: 6.0,      // fast flicker
      sizeBase: 26,       // wide, soft embers at the base
      sizeTip: 7,         // small embers at the tip
      intensity: 1.7,     // > 1 so bright cores feed the bloom pass
      colorHot: [1.0, 0.95, 0.75],  // white-hot yellow core
      colorMid: [1.0, 0.5, 0.12],   // orange
      colorCool: [0.65, 0.09, 0.02], // dark red before death
      opacity: 1.0,
      sizeScale: 20,
      maxSize: 128,
      followTarget: null, // optional object/camera; emitter tracks its x/z
    }, options) as FireOptions;

    const n = this.count = opt.count;

    this.mat = new FireMaterial({
      opacity: opt.opacity,
      sizeScale: opt.sizeScale,
      maxSize: opt.maxSize,
    });

    this._px = new Float32Array(n);
    this._py = new Float32Array(n);
    this._pz = new Float32Array(n);
    this._ang = new Float32Array(n);
    this._rad = new Float32Array(n);
    this._vy = new Float32Array(n);
    this._age = new Float32Array(n);
    this._life = new Float32Array(n);
    this._size = new Float32Array(n);
    this._phase = new Float32Array(n);
    this._swayAmp = new Float32Array(n);
    this._swayFreq = new Float32Array(n);

    this.mesh = new ParticleMesh(n);
    this.addMesh(this.mesh);

    for (let i = 0; i < n; i++) {
      this._spawn(i, true);
    }
    this._writeAll();
  }

  private _rand(a: number, b: number): number { return a + Math.random() * (b - a); }

  // (re)initialise a single ember. On the initial fill embers are spread
  // through their lifespan so the flame starts full; when recycled they begin
  // again at the base with a fresh lifespan.
  private _spawn(i: number, initial: boolean): void {
    const o = this.options;
    this._ang[i] = this._rand(0, Math.PI * 2);
    // bias the radius toward the centre (sqrt) for a denser core
    this._rad[i] = o.radius * Math.sqrt(Math.random());
    this._vy[i] = o.riseSpeed * this._rand(1 - o.riseVariance, 1 + o.riseVariance);
    this._life[i] = (o.height / Math.max(this._vy[i], 0.001)) * this._rand(0.8, 1.2);
    this._age[i] = initial ? this._rand(0, this._life[i]) : 0;
    this._size[i] = this._rand(0.8, 1.2);
    this._phase[i] = this._rand(0, Math.PI * 2);
    this._swayAmp[i] = o.swayAmp * this._rand(0.5, 1.2);
    this._swayFreq[i] = o.swayFreq * this._rand(0.7, 1.3);
  }

  // life fade: a quick fade-in off the fuel bed, a longer fade-out toward the
  // tip. Multiplies the ember colour so additive build-up stays clean.
  private _fade(f: number): number {
    const fin = Math.min(f / 0.08, 1.0);
    const fout = Math.min((1.0 - f) / 0.4, 1.0);
    return Math.max(fin, 0) * Math.max(fout, 0);
  }

  private _writeOne(i: number): void {
    const n = this.count;
    const o = this.options;
    const vb: any = this.mesh.vertexBuffer;

    const f = Math.min(this._age[i] / Math.max(this._life[i], 0.001), 1.0);

    // colour gradient: hot → mid over the first half, mid → cool over the rest
    const hot = o.colorHot, mid = o.colorMid, cool = o.colorCool;
    let r: number, g: number, b: number;
    if (f < 0.5) {
      const t = f / 0.5;
      r = hot[0] + (mid[0] - hot[0]) * t;
      g = hot[1] + (mid[1] - hot[1]) * t;
      b = hot[2] + (mid[2] - hot[2]) * t;
    } else {
      const t = (f - 0.5) / 0.5;
      r = mid[0] + (cool[0] - mid[0]) * t;
      g = mid[1] + (cool[1] - mid[1]) * t;
      b = mid[2] + (cool[2] - mid[2]) * t;
    }
    const k = this._fade(f) * o.intensity;

    // size tapers from the wide base to the narrow tip
    const size = (o.sizeBase + (o.sizeTip - o.sizeBase) * f) * this._size[i];

    // ParticleMesh layout: [positions][colors][sizes]
    arraySet(vb, i * 3, this._px[i], this._py[i], this._pz[i]);
    arraySet(vb, (n + i) * 3, r * k, g * k, b * k);
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

      // rise at the ember's own speed; lifespan = height / riseSpeed, so an
      // ember reaches ~`height` just as it dies, giving a stable flame column.
      this._py[i] = this._age[i] * this._vy[i];

      // radius narrows toward the tip; spawn spread pushes embers slightly out
      const radius = this._rad[i] * (1 - o.convergence * f) + o.spread * f;
      this._phase[i] += this._swayFreq[i] * dt;
      const sway = Math.sin(this._phase[i]) * this._swayAmp[i] * (0.3 + f); // more flicker higher up

      this._px[i] = Math.cos(this._ang[i]) * radius + sway;
      this._pz[i] = Math.sin(this._ang[i]) * radius + Math.cos(this._phase[i] * 0.9) * this._swayAmp[i] * f;
    }

    this._writeAll();
  }
}
