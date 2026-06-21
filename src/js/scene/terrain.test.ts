import { describe, it, expect } from 'vitest';
import { Terrain } from './terrain';
import { SceneObject } from './object';

describe('Terrain mesh generation', () => {
  it('builds an indexed grid mesh with matching vertex/normal/uv counts', () => {
    const t = new Terrain({ width: 10, depth: 10, segments: 4, height: 2 });
    const mesh = t.meshes[0];

    const expectedVerts = (4 + 1) * (4 + 1);
    expect(mesh.meta.vertexCount).toBe(expectedVerts);
    expect(mesh.vertices.length / 3).toBe(expectedVerts);
    expect(mesh.normals.length).toBe(mesh.vertices.length);
    expect(mesh.texcoords.length / 2).toBe(expectedVerts);

    expect(mesh.indexed).toBe(true);
    expect(mesh.indexes.length).toBe(4 * 4 * 6); // 2 tris per quad
  });

  it('produces unit-length surface normals', () => {
    const t = new Terrain({ width: 20, depth: 20, segments: 8, height: 4 });
    const n = t.meshes[0].normals;
    for (let i = 0; i < n.length; i += 3) {
      expect(Math.hypot(n[i], n[i + 1], n[i + 2])).toBeCloseTo(1, 4);
    }
  });

  it('honours a custom height function exactly at grid vertices', () => {
    const fn = (x: number, z: number) => x * 0.1 + z * 0.2;
    const t = new Terrain({ width: 10, depth: 10, segments: 10, heightFunction: fn });

    // grid vertices fall on integer steps → getHeightAt is exact there
    expect(t.getHeightAt(0, 0)).toBeCloseTo(fn(0, 0), 5);
    expect(t.getHeightAt(3, -2)).toBeCloseTo(fn(3, -2), 5);
    expect(t.getHeightAt(-5, 5)).toBeCloseTo(fn(-5, 5), 5);
  });

  it('clamps height queries outside the terrain to the edge', () => {
    const t = new Terrain({ width: 10, depth: 10, segments: 10, heightFunction: () => 3 });
    expect(t.getHeightAt(999, 999)).toBeCloseTo(3, 5);
    expect(t.getHeightAt(-999, 0)).toBeCloseTo(3, 5);
  });

  it('reports an up normal for flat ground', () => {
    const t = new Terrain({ width: 10, depth: 10, segments: 6, heightFunction: () => 0 });
    const n = t.getNormalAt(1, 1);
    expect(n.y).toBeCloseTo(1, 5);
    expect(n.x).toBeCloseTo(0, 5);
    expect(n.z).toBeCloseTo(0, 5);
  });
});

describe('Terrain.scatter', () => {
  it('snaps placed objects onto the surface as children', () => {
    const fn = (x: number, z: number) => x * 0.25;
    const t = new Terrain({ width: 20, depth: 20, segments: 20, heightFunction: fn });

    let seq = 0;
    const rng = () => { seq = (seq + 0.37) % 1; return seq; }; // deterministic

    const placed = t.scatter(() => new SceneObject(), 25, {
      minScale: 0.5, maxScale: 0.5, yOffset: 0, rng,
    });

    expect(placed.length).toBe(25);
    for (const obj of placed) {
      expect(t.objects).toContain(obj);
      expect(obj.parent).toBe(t);
      // y matches the surface height at its (x, z)
      expect(obj.location.y).toBeCloseTo(t.getHeightAt(obj.location.x, obj.location.z), 4);
      expect(obj.scale.x).toBeCloseTo(0.5, 6);
    }
  });

  it('skips spots steeper than maxSlopeAngle', () => {
    // a 45°-ish ramp: slope normal is well off vertical everywhere
    const t = new Terrain({ width: 10, depth: 10, segments: 10, heightFunction: (x) => x });
    const placed = t.scatter(() => new SceneObject(), 20, { maxSlopeAngle: 10 });
    expect(placed.length).toBe(0);
  });
});
