
import { Vec3 } from "@/math";
import { SceneObject } from '../scene/object';
import { Mesh } from '../webgl/mesh';

// ---------------------------------------------------------------------------
// Wavefront OBJ / MTL loader
//
// Supports:
//   - triangle AND polygon faces (quads / n-gons are fan-triangulated)
//   - the v, v/vt, v//vn and v/vt/vn face vertex formats
//   - negative (relative) face indices
//   - per-material face groups (`usemtl`) → one child SceneObject per material
//   - companion .mtl diffuse colours (`Kd`), or an explicit colour override
//   - geometric fallback normals for faces that ship without `vn`
//
// The previous loader matched only `f a/b/c a/b/c a/b/c` and silently dropped
// the 4th vertex of every quad and ignored materials entirely — meshes that
// mixed quads & triangles (very common for low-poly assets) came out broken.
// ---------------------------------------------------------------------------

export interface ObjMaterial {
  /** Diffuse colour as [r, g, b] in the 0..1 range. */
  color?: number[];
}

export type ObjMaterialMap = { [name: string]: ObjMaterial };

export interface LoadObjOptions {
  /** Material colours keyed by material name; overrides any companion .mtl. */
  materials?: ObjMaterialMap;
  /** Centre the model on the X/Z axes (defaults to true). */
  recenter?: boolean;
  /** Sit the model's lowest point on y = 0 instead of centring it vertically. */
  alignBottom?: boolean;
}

interface ObjGroup {
  material?: string;
  vertices: number[];
  normals: number[];
  texcoords: number[];
  hasTexcoords: boolean;
}

/**
 * Parse a Wavefront .mtl document into a map of material name → diffuse colour.
 */
export function loadMtlFormat(text: string): ObjMaterialMap {
  const materials: ObjMaterialMap = {};
  let current: ObjMaterial | undefined;

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();

    if (line.startsWith("newmtl ")) {
      current = {};
      materials[line.slice(7).trim()] = current;
    } else if (current && line.startsWith("Kd ")) {
      const c = line.slice(3).trim().split(/\s+/).map(Number);
      if (c.length >= 3 && c.every(n => !Number.isNaN(n))) {
        current.color = [c[0], c[1], c[2]];
      }
    }
  }

  return materials;
}

/** Resolve a 1-based / negative OBJ index into a 0-based array index. */
function resolveIndex(token: string, count: number): number {
  const i = Number.parseInt(token, 10);
  if (Number.isNaN(i)) return -1;
  return i < 0 ? count + i : i - 1;
}

export function loadObjFormat(text: string, options: LoadObjOptions = {}): SceneObject {
  const positions: number[][] = [];
  const normals: number[][] = [];
  const texcoords: number[][] = [];

  const groups: ObjGroup[] = [];
  let current: ObjGroup | undefined;

  const beginGroup = (material?: string) => {
    current = { material, vertices: [], normals: [], texcoords: [], hasTexcoords: false };
    groups.push(current);
    return current;
  };

  const arrayOfLines = text.split(/\r?\n/);

  for (const raw of arrayOfLines) {
    const line = raw.trim();
    if (line.length === 0 || line.charCodeAt(0) === 35 /* '#' */) continue;

    const parts = line.split(/\s+/);
    const tag = parts[0];

    switch (tag) {
      case "v":
        positions.push([+parts[1], +parts[2], +parts[3]]);
        break;

      case "vn":
        normals.push([+parts[1], +parts[2], +parts[3]]);
        break;

      case "vt":
        texcoords.push([+parts[1], +(parts[2] ?? 0)]);
        break;

      case "usemtl":
        beginGroup(parts[1]);
        break;

      case "f": {
        if (!current) beginGroup();

        // Resolve every vertex reference of this face once.
        const refs: { v: number; t: number; n: number }[] = [];
        for (let i = 1; i < parts.length; i++) {
          const comps = parts[i].split("/");
          refs.push({
            v: resolveIndex(comps[0], positions.length),
            t: comps.length > 1 && comps[1] !== "" ? resolveIndex(comps[1], texcoords.length) : -1,
            n: comps.length > 2 && comps[2] !== "" ? resolveIndex(comps[2], normals.length) : -1,
          });
        }

        // Fan-triangulate (works for triangles, quads and convex n-gons).
        for (let k = 1; k + 1 < refs.length; k++) {
          emitTriangle(current!, positions, normals, texcoords, refs[0], refs[k], refs[k + 1]);
        }
        break;
      }

      default:
        break;
    }
  }

  if (positions.length === 0) {
    throw Error("no vertex found from obj format.");
  }

  // --- compute alignment offset over the actually-used vertices ---------------
  const recenter = options.recenter !== false;
  const offset = computeAlignmentOffset(groups, recenter, options.alignBottom === true);

  if (offset.x !== 0 || offset.y !== 0 || offset.z !== 0) {
    for (const g of groups) {
      const v = g.vertices;
      for (let i = 0; i < v.length; i += 3) {
        v[i] -= offset.x;
        v[i + 1] -= offset.y;
        v[i + 2] -= offset.z;
      }
    }
  }

  // --- build scene objects ----------------------------------------------------
  const usable = groups.filter(g => g.vertices.length >= 9);

  const root = new SceneObject();

  // Single material group → keep the mesh on the root object (flat & simple).
  if (usable.length <= 1) {
    const g = usable[0];
    if (g) {
      root.addMesh(buildMesh(g));
      applyMaterialColor(root, g, options.materials);
    } else {
      root.mat = {};
    }
    return root;
  }

  for (const g of usable) {
    const child = new SceneObject();
    child.name = g.material;
    child.addMesh(buildMesh(g));
    applyMaterialColor(child, g, options.materials);
    root.add(child);
  }

  return root;
}

function emitTriangle(
  group: ObjGroup,
  positions: number[][], normals: number[][], texcoords: number[][],
  a: { v: number; t: number; n: number },
  b: { v: number; t: number; n: number },
  c: { v: number; t: number; n: number },
): void {
  const pa = positions[a.v], pb = positions[b.v], pc = positions[c.v];
  if (!pa || !pb || !pc) return;

  group.vertices.push(pa[0], pa[1], pa[2], pb[0], pb[1], pb[2], pc[0], pc[1], pc[2]);

  // normals: use supplied vn for all three, else a geometric face normal.
  if (a.n >= 0 && b.n >= 0 && c.n >= 0 && normals[a.n] && normals[b.n] && normals[c.n]) {
    const na = normals[a.n], nb = normals[b.n], nc = normals[c.n];
    group.normals.push(na[0], na[1], na[2], nb[0], nb[1], nb[2], nc[0], nc[1], nc[2]);
  } else {
    const fn = faceNormal(pa, pb, pc);
    group.normals.push(fn.x, fn.y, fn.z, fn.x, fn.y, fn.z, fn.x, fn.y, fn.z);
  }

  // texcoords (default to 0,0 for vertices that lack them so the array stays aligned).
  const ta = texcoords[a.t], tb = texcoords[b.t], tc = texcoords[c.t];
  if (ta || tb || tc) group.hasTexcoords = true;
  group.texcoords.push(
    ta ? ta[0] : 0, ta ? ta[1] : 0,
    tb ? tb[0] : 0, tb ? tb[1] : 0,
    tc ? tc[0] : 0, tc ? tc[1] : 0,
  );
}

function faceNormal(a: number[], b: number[], c: number[]): Vec3 {
  const e1 = new Vec3(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const e2 = new Vec3(c[0] - a[0], c[1] - a[1], c[2] - a[2]);
  return e1.cross(e2).normalize();
}

function computeAlignmentOffset(groups: ObjGroup[], recenter: boolean, alignBottom: boolean): Vec3 {
  let minx = Infinity, miny = Infinity, minz = Infinity;
  let maxx = -Infinity, maxy = -Infinity, maxz = -Infinity;

  for (const g of groups) {
    const v = g.vertices;
    for (let i = 0; i < v.length; i += 3) {
      const x = v[i], y = v[i + 1], z = v[i + 2];
      if (x < minx) minx = x; if (x > maxx) maxx = x;
      if (y < miny) miny = y; if (y > maxy) maxy = y;
      if (z < minz) minz = z; if (z > maxz) maxz = z;
    }
  }

  if (!Number.isFinite(minx)) return new Vec3(0, 0, 0);

  return new Vec3(
    recenter ? (minx + maxx) * 0.5 : 0,
    alignBottom ? miny : (recenter ? (miny + maxy) * 0.5 : 0),
    recenter ? (minz + maxz) * 0.5 : 0,
  );
}

function buildMesh(group: ObjGroup): Mesh {
  const mesh = new Mesh();
  const vertexCount = group.vertices.length / 3;

  mesh.vertices = group.vertices;
  mesh.normals = group.normals;
  if (group.hasTexcoords) mesh.texcoords = group.texcoords;

  mesh.meta = {
    vertexCount,
    normalCount: vertexCount,
    texcoordCount: group.hasTexcoords ? vertexCount : 0,
    tangentBasisCount: 0,
    uvCount: 1,
  } as any;

  (mesh as any).composeMode = (Mesh as any).ComposeModes.Triangles;
  (mesh as any).updateBuffer();

  return mesh;
}

function applyMaterialColor(obj: any, group: ObjGroup, override?: ObjMaterialMap): void {
  if (!obj.mat) obj.mat = {};

  const def = (group.material && override && override[group.material]) || undefined;
  if (def && Array.isArray(def.color)) {
    obj.mat.color = def.color.slice();
  }

  // OBJ/MTL carry no metallic-roughness data, so override the engine's
  // mid-gloss Material default with a matte, non-metallic surface — the right
  // look for the diffuse-only assets this loader handles.
  obj.mat.roughness = 0.85;
  obj.mat.metallic = 0.0;
}
