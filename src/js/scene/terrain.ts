
import { Vec3, Color3 } from "@/math";
import { Mesh } from "../webgl/mesh";
import { SceneObject } from "./object";

// ---------------------------------------------------------------------------
// Terrain
//
// A grid-based heightfield ground object. By default it generates rolling
// hills from layered value noise (fractal Brownian motion), but any height
// can be supplied through `heightFunction`. The generated height grid is kept
// so the surface can be queried with `getHeightAt()` / `getNormalAt()` — handy
// for dropping props (trees, rocks, the camera, …) exactly onto the ground.
//
//   const terrain = new Terrain({ width: 80, depth: 80, segments: 100, height: 7 });
//   scene.add(terrain);
//   terrain.scatter(() => treeModel.clone(), 60, { yOffset: -0.1 });
// ---------------------------------------------------------------------------

export interface TerrainOptions {
  /** World size along the X axis. */
  width?: number;
  /** World size along the Z axis. */
  depth?: number;
  /** Grid resolution (number of quads per axis). */
  segments?: number;
  /** Maximum height amplitude of the generated noise. */
  height?: number;
  /** Number of noise cells across the terrain (higher = more, smaller hills). */
  noiseScale?: number;
  /** fBm octaves for the built-in noise. */
  octaves?: number;
  /** Seed for the built-in noise (same seed → same terrain). */
  seed?: number;
  /**
   * Custom height sampler `(x, z, height) => y` in terrain-local world units
   * (x ∈ [-width/2, width/2], z ∈ [-depth/2, depth/2]). Overrides the built-in
   * noise when provided. The configured `height` option is passed as the third
   * argument so the function can scale to it (e.g. `(x, z, h) => shape * h`),
   * since `height` itself only feeds the built-in noise.
   */
  heightFunction?: (x: number, z: number, height: number) => number;
  /** Base diffuse colour ([r,g,b] 0..1 or a Color3). */
  color?: number[] | Color3;
  /** Texture UV repeat count across the whole terrain. */
  textureRepeat?: number;
}

export interface ScatterOptions {
  /** Keep placements this far inside the terrain edges. */
  margin?: number;
  /** Minimum uniform scale applied to scattered objects. */
  minScale?: number;
  /** Maximum uniform scale applied to scattered objects. */
  maxScale?: number;
  /** Vertical offset added after snapping to the surface (e.g. sink trunks). */
  yOffset?: number;
  /** Skip spots steeper than this slope, in degrees (surface normal vs up). */
  maxSlopeAngle?: number;
  /** Randomise heading around Y (defaults to true). */
  randomRotation?: boolean;
  /** Random source in [0,1); defaults to Math.random for reproducible seeding. */
  rng?: () => number;
}

export class Terrain extends SceneObject {
  readonly width: number;
  readonly depth: number;
  readonly segments: number;

  /** Per-vertex heights, row-major over (segments+1) × (segments+1). */
  private _heights: Float32Array;
  private _gridW: number;
  private _gridH: number;

  constructor(options: TerrainOptions = {}) {
    super();

    this.width = options.width ?? 60;
    this.depth = options.depth ?? 60;
    this.segments = Math.max(1, Math.floor(options.segments ?? 80));

    const height = options.height ?? 6;
    const sampler = options.heightFunction ?? makeNoiseSampler(this.width, this.depth, {
      amplitude: height,
      noiseScale: options.noiseScale ?? 4,
      octaves: options.octaves ?? 4,
      seed: options.seed ?? 1337,
    });

    this._gridW = this.segments + 1;
    this._gridH = this.segments + 1;
    this._heights = new Float32Array(this._gridW * this._gridH);

    const mesh = this._buildMesh(sampler, options.textureRepeat ?? 1, height);
    this.addMesh(mesh);

    const color = options.color ?? [0.27, 0.42, 0.18];
    this.mat.color = color instanceof Color3 ? color : new Color3(color[0], color[1], color[2]);
    this.mat.roughness = 1.0;
    this.mat.metallic = 0.0;

    // Ground typically receives shadows but casting from a huge plane only
    // produces self-shadow acne, so leave it off by default.
    this.castShadow = false;
    this.receiveShadow = true;
  }

  private _buildMesh(sampler: (x: number, z: number, height: number) => number, textureRepeat: number, height: number): Mesh {
    const gw = this._gridW, gh = this._gridH;
    const halfW = this.width * 0.5, halfD = this.depth * 0.5;
    const heights = this._heights;

    const vertices: number[] = new Array(gw * gh * 3);
    const texcoords: number[] = new Array(gw * gh * 2);

    // positions + heights
    for (let j = 0; j < gh; j++) {
      const tz = j / this.segments;
      const z = -halfD + tz * this.depth;
      for (let i = 0; i < gw; i++) {
        const tx = i / this.segments;
        const x = -halfW + tx * this.width;
        const y = sampler(x, z, height);

        const gi = j * gw + i;
        heights[gi] = y;

        vertices[gi * 3] = x;
        vertices[gi * 3 + 1] = y;
        vertices[gi * 3 + 2] = z;

        texcoords[gi * 2] = tx * textureRepeat;
        texcoords[gi * 2 + 1] = tz * textureRepeat;
      }
    }

    // smooth normals from the height gradient (central differences)
    const normals: number[] = new Array(gw * gh * 3);
    const dx = this.width / this.segments;
    const dz = this.depth / this.segments;
    for (let j = 0; j < gh; j++) {
      for (let i = 0; i < gw; i++) {
        const hl = heights[j * gw + Math.max(i - 1, 0)];
        const hr = heights[j * gw + Math.min(i + 1, gw - 1)];
        const hd = heights[Math.max(j - 1, 0) * gw + i];
        const hu = heights[Math.min(j + 1, gh - 1) * gw + i];

        const n = new Vec3(-(hr - hl) / (2 * dx), 1, -(hu - hd) / (2 * dz)).normalize();
        const gi = (j * gw + i) * 3;
        normals[gi] = n.x; normals[gi + 1] = n.y; normals[gi + 2] = n.z;
      }
    }

    // indices (two triangles per quad)
    const indexes: number[] = new Array(this.segments * this.segments * 6);
    let p = 0;
    for (let j = 0; j < this.segments; j++) {
      for (let i = 0; i < this.segments; i++) {
        const a = j * gw + i;
        const b = a + 1;
        const c = a + gw;
        const d = c + 1;
        indexes[p++] = a; indexes[p++] = c; indexes[p++] = b;
        indexes[p++] = b; indexes[p++] = c; indexes[p++] = d;
      }
    }

    const mesh = new Mesh();
    const vertexCount = gw * gh;

    mesh.vertices = vertices;
    mesh.normals = normals;
    mesh.texcoords = texcoords;
    mesh.indexes = indexes;
    mesh.indexed = true;

    mesh.meta = {
      vertexCount,
      normalCount: vertexCount,
      texcoordCount: vertexCount,
      indexCount: indexes.length,
      tangentBasisCount: 0,
      uvCount: 1,
    } as any;

    (mesh as any).composeMode = (Mesh as any).ComposeModes.Triangles;
    (mesh as any).updateBuffer();

    return mesh;
  }

  /**
   * Terrain-local surface height at (x, z). Coordinates outside the terrain
   * are clamped to the edge. Uses bilinear interpolation of the height grid.
   */
  getHeightAt(x: number, z: number): number {
    const gw = this._gridW, gh = this._gridH;
    const halfW = this.width * 0.5, halfD = this.depth * 0.5;

    let fx = ((x + halfW) / this.width) * this.segments;
    let fz = ((z + halfD) / this.depth) * this.segments;

    fx = Math.min(Math.max(fx, 0), gw - 1);
    fz = Math.min(Math.max(fz, 0), gh - 1);

    const i0 = Math.floor(fx), j0 = Math.floor(fz);
    const i1 = Math.min(i0 + 1, gw - 1), j1 = Math.min(j0 + 1, gh - 1);
    const tx = fx - i0, tz = fz - j0;

    const h = this._heights;
    const h00 = h[j0 * gw + i0], h10 = h[j0 * gw + i1];
    const h01 = h[j1 * gw + i0], h11 = h[j1 * gw + i1];

    const a = h00 + (h10 - h00) * tx;
    const b = h01 + (h11 - h01) * tx;
    return a + (b - a) * tz;
  }

  /** Approximate terrain-local surface normal at (x, z). */
  getNormalAt(x: number, z: number): Vec3 {
    const dx = this.width / this.segments;
    const dz = this.depth / this.segments;
    const hl = this.getHeightAt(x - dx, z), hr = this.getHeightAt(x + dx, z);
    const hd = this.getHeightAt(x, z - dz), hu = this.getHeightAt(x, z + dz);
    return new Vec3(-(hr - hl) / (2 * dx), 1, -(hu - hd) / (2 * dz)).normalize();
  }

  /**
   * Scatter `count` objects across the surface. `factory(index)` produces each
   * object (e.g. `() => treeModel.clone()`); every object is snapped to the
   * ground, given a random heading and a random uniform scale, then added as a
   * child of the terrain. Returns the placed objects.
   */
  scatter(factory: (index: number) => SceneObject, count: number, options: ScatterOptions = {}): SceneObject[] {
    const margin = options.margin ?? 0;
    const minScale = options.minScale ?? 1;
    const maxScale = options.maxScale ?? 1;
    const yOffset = options.yOffset ?? 0;
    const randomRotation = options.randomRotation !== false;
    const rng = options.rng ?? Math.random;

    const minSlopeDot = typeof options.maxSlopeAngle === "number"
      ? Math.cos(options.maxSlopeAngle * Math.PI / 180)
      : -1;

    const halfW = this.width * 0.5 - margin;
    const halfD = this.depth * 0.5 - margin;

    const placed: SceneObject[] = [];

    for (let i = 0; i < count; i++) {
      let x = 0, z = 0, ok = false;

      // a few attempts to satisfy the slope constraint before giving up
      for (let attempt = 0; attempt < 8; attempt++) {
        x = -halfW + rng() * (halfW * 2);
        z = -halfD + rng() * (halfD * 2);

        if (minSlopeDot <= -1 || this.getNormalAt(x, z).y >= minSlopeDot) {
          ok = true;
          break;
        }
      }

      if (!ok) continue;

      const obj = factory(i);
      if (!obj) continue;

      const y = this.getHeightAt(x, z) + yOffset;
      obj.location.set(x, y, z);

      if (randomRotation) obj.angle.y = rng() * 360;

      const s = minScale + rng() * (maxScale - minScale);
      obj.scale.set(s, s, s);

      this.add(obj);
      placed.push(obj);
    }

    return placed;
  }
}

// --- built-in fractal value-noise heightfield -------------------------------

interface NoiseParams {
  amplitude: number;
  noiseScale: number;
  octaves: number;
  seed: number;
}

function makeNoiseSampler(width: number, depth: number, params: NoiseParams): (x: number, z: number) => number {
  const { amplitude, noiseScale, octaves, seed } = params;

  const hash = (ix: number, iz: number): number => {
    let h = (ix | 0) * 374761393 + (iz | 0) * 668265263 + seed * 362437;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967295;
  };

  const smooth = (t: number) => t * t * (3 - 2 * t);
  const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

  const valueNoise = (x: number, z: number): number => {
    const ix = Math.floor(x), iz = Math.floor(z);
    const fx = x - ix, fz = z - iz;
    const ux = smooth(fx), uz = smooth(fz);

    const a = hash(ix, iz), b = hash(ix + 1, iz);
    const c = hash(ix, iz + 1), d = hash(ix + 1, iz + 1);

    return lerp(lerp(a, b, ux), lerp(c, d, ux), uz);
  };

  return (x: number, z: number): number => {
    // normalise into noise-cell space
    const nx = ((x / width) + 0.5) * noiseScale;
    const nz = ((z / depth) + 0.5) * noiseScale;

    let sum = 0, amp = 1, freq = 1, norm = 0;
    for (let o = 0; o < octaves; o++) {
      sum += amp * valueNoise(nx * freq, nz * freq);
      norm += amp;
      amp *= 0.5;
      freq *= 2;
    }

    return (sum / norm) * amplitude;
  };
}
