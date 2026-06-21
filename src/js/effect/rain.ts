import { Color3 } from "@/math";
import { ParticleObject } from "../scene/object.js";
import { ParticleMesh } from "../webgl/mesh.js";
import { Material } from "../scene/material";
import { arraySet } from "../utility/utility";

// Rain — a self-contained rainfall effect.
//
// A box-shaped volume of falling raindrops, rendered as slanted point-sprite
// streaks by the "rain" shader. Drops fall along -Y, drift with the wind and
// recycle to the top of the volume once they reach the bottom.
//
// Usage:
//   const rain = new Rain({ count: 6000, wind: [4, 0] });
//   scene.add(rain);                         // add after scene geometry
//   scene.on("frame", () => rain.update());  // drive the simulation
//   scene.animation = true;

export interface RainMaterialOptions {
  color?: number[] | Color3;
  opacity?: number;     // overall rain alpha
  streakWidth?: number; // streak half-width (fraction of the sprite)
  slant?: number;       // screen-space shear
}

// RainMaterial owns both the shader selection ("rain") and the streak
// appearance parameters the RainShader reads. This replaces the old pattern of
// setting `obj.shader = { name: "rain" }` plus loose per-object properties.
export class RainMaterial extends Material {
  opacity = 0.5;
  streakWidth = 0.13;
  slant = 0;

  override get shaderName(): string {
    return "rain";
  }

  constructor(options: RainMaterialOptions = {}) {
    super();
    // Raindrops must not cast shadows. Declared here as the material's intent;
    // the shadow pass currently also honours SceneObject.castShadow (see Rain),
    // until material-driven shadow control is wired up.
    this.castShadow = false;

    if (options.color !== undefined) this.color = options.color;
    if (typeof options.opacity === "number") this.opacity = options.opacity;
    if (typeof options.streakWidth === "number") this.streakWidth = options.streakWidth;
    if (typeof options.slant === "number") this.slant = options.slant;
  }

  override copyFrom(mat: any): void {
    super.copyFrom(mat);
    if (typeof mat.opacity === "number") this.opacity = mat.opacity;
    if (typeof mat.streakWidth === "number") this.streakWidth = mat.streakWidth;
    if (typeof mat.slant === "number") this.slant = mat.slant;
  }
}

export interface RainOptions {
  count: number;
  width: number;
  depth: number;
  height: number;
  speed: number;
  speedVariance: number;
  wind: number[];
  color: number[];
  opacity: number;
  lengthMin: number;
  lengthMax: number;
  thickness: number;
  slant: number;
  followTarget: any;
}

export class Rain extends ParticleObject {
  options: RainOptions;
  count: number;
  mesh: ParticleMesh;

  private _px: Float32Array;
  private _py: Float32Array;
  private _pz: Float32Array;
  private _vy: Float32Array;
  private _len: Float32Array;
  private _bri: Float32Array;
  private _lastTime = 0;

  constructor(options: Partial<RainOptions> = {}) {
    super();

    const opt = this.options = Object.assign({
      count: 6000,        // number of raindrops
      width: 40,          // volume size along X
      depth: 40,          // volume size along Z
      height: 30,         // volume size along Y (fall distance)
      speed: 32,          // base fall speed, units per second
      speedVariance: 0.4, // ± fraction of speed randomised per drop
      wind: [3, 0],       // horizontal drift [x, z] in units per second
      color: [0.62, 0.74, 0.95],
      opacity: 0.5,       // overall rain alpha
      lengthMin: 10,      // streak length in pixels (short / near vertical)
      lengthMax: 22,      // streak length in pixels (long)
      thickness: 0.13,    // streak half-width (fraction of the sprite)
      slant: 0.16,        // screen-space shear, gives the wind-blown look
      followTarget: null, // optional object/camera; volume tracks its x/z
    }, options) as RainOptions;

    const n = this.count = opt.count;

    // The RainMaterial selects the "rain" shader and carries the streak
    // appearance uniforms (opacity / streakWidth / slant) read by RainShader.
    this.mat = new RainMaterial({
      color: opt.color,
      opacity: opt.opacity,
      streakWidth: opt.thickness,
      slant: opt.slant,
    });

    // Raindrops must not cast shadows (they would splat the particle points into
    // the shadow map as speckle). RainMaterial declares castShadow=false and the
    // shadow pass honours the material — no per-object flag needed.

    // simulation state (typed arrays for speed)
    this._px = new Float32Array(n);
    this._py = new Float32Array(n);
    this._pz = new Float32Array(n);
    this._vy = new Float32Array(n);  // fall speed
    this._len = new Float32Array(n); // streak length (px)
    this._bri = new Float32Array(n); // per-drop brightness

    this.mesh = new ParticleMesh(n);
    this.addMesh(this.mesh);

    for (let i = 0; i < n; i++) {
      this._spawn(i, true);
    }
    this._writeAll();
  }

  get halfW(): number { return this.options.width * 0.5; }
  get halfD(): number { return this.options.depth * 0.5; }
  get halfH(): number { return this.options.height * 0.5; }

  private _rand(a: number, b: number): number { return a + Math.random() * (b - a); }

  // (re)initialise a single raindrop. On the initial fill drops are spread
  // through the whole volume; when recycled they reappear at the top.
  private _spawn(i: number, initial: boolean): void {
    const o = this.options;
    this._px[i] = this._rand(-this.halfW, this.halfW);
    this._pz[i] = this._rand(-this.halfD, this.halfD);
    this._py[i] = initial ? this._rand(-this.halfH, this.halfH) : this.halfH;
    this._vy[i] = o.speed * this._rand(1 - o.speedVariance, 1 + o.speedVariance);
    this._len[i] = this._rand(o.lengthMin, o.lengthMax);
    this._bri[i] = this._rand(0.5, 1.0);
  }

  private _writeOne(i: number): void {
    const n = this.count;
    const vb: any = this.mesh.vertexBuffer;
    const col: any = this.mat.color;
    const c: number[] = Array.isArray(col) ? col : [col.r, col.g, col.b];
    const b = this._bri[i];
    // ParticleMesh layout: [positions][colors][sizes]
    arraySet(vb, i * 3, this._px[i], this._py[i], this._pz[i]);
    arraySet(vb, (n + i) * 3, c[0] * b, c[1] * b, c[2] * b);
    arraySet(vb, n * 6 + i, this._len[i]);
  }

  private _writeAll(): void {
    for (let i = 0; i < this.count; i++) this._writeOne(i);
    this.mesh.update();
  }

  // Advance the simulation by one frame. Call once per rendered frame
  // (e.g. from scene.on("frame", ...)).
  update(): void {
    const now = (typeof performance !== "undefined" ? performance.now() : Date.now());
    // seconds since last frame, clamped so a backgrounded tab can't teleport drops
    let dt = this._lastTime ? (now - this._lastTime) / 1000 : 0.016;
    this._lastTime = now;
    if (dt > 0.05) dt = 0.05;

    const o = this.options;
    const n = this.count;
    const halfH = this.halfH, halfW = this.halfW, halfD = this.halfD;
    const wx = o.wind[0] * dt, wz = o.wind[1] * dt;

    // keep the rain volume centred on a moving target, if requested
    const t = o.followTarget;
    if (t && t.location) {
      this.location.x = t.location.x;
      this.location.z = t.location.z;
    }

    for (let i = 0; i < n; i++) {
      const y = this._py[i] - this._vy[i] * dt;

      if (y < -halfH) {
        // reached the ground — recycle to the top with fresh parameters
        this._spawn(i, false);
        continue;
      }

      let x = this._px[i] + wx;
      let z = this._pz[i] + wz;

      // wrap horizontal drift so drops stay inside the volume
      if (x > halfW) x -= o.width; else if (x < -halfW) x += o.width;
      if (z > halfD) z -= o.depth; else if (z < -halfD) z += o.depth;

      this._px[i] = x;
      this._py[i] = y;
      this._pz[i] = z;
    }

    this._writeAll();
  }
}
