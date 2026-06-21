import { describe, it, expect } from 'vitest';
import { loadObjFormat, loadMtlFormat } from './objloader';

// Vite's `?raw` suffix inlines the real asset as a string — no node:fs needed.
// @ts-ignore - the ?raw module is resolved by Vite at test time
import objText from '../../../examples/public/models/low_poly_tree/Lowpoly_tree_sample.obj?raw';
// @ts-ignore - the ?raw module is resolved by Vite at test time
import mtlText from '../../../examples/public/models/low_poly_tree/Lowpoly_tree_sample.mtl?raw';

// Independently count the triangles the file *should* produce, so the test
// catches any regression where quads/n-gons are mis-triangulated.
function expectedTriangleVertexCount(objText: string): number {
  let tris = 0;
  for (const raw of objText.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line.startsWith('f ')) continue;
    const n = line.split(/\s+/).length - 1; // vertex refs in the face
    if (n >= 3) tris += n - 2;              // fan triangulation
  }
  return tris * 3;
}

describe('loadMtlFormat', () => {
  it('parses diffuse colours keyed by material name', () => {
    const mats = loadMtlFormat(mtlText);
    expect(Object.keys(mats).sort()).toEqual(['Bark', 'Tree']);
    expect(mats.Bark.color![0]).toBeCloseTo(0.207595, 4);
    expect(mats.Tree.color![1]).toBeCloseTo(0.440506, 4);
  });
});

describe('loadObjFormat (real low-poly tree)', () => {
  const materials = loadMtlFormat(mtlText);

  it('splits the mesh into one child per material', () => {
    const root = loadObjFormat(objText, { materials });
    const names = root.objects.map((o: any) => o.name).sort();
    expect(names).toEqual(['Bark', 'Tree']);
  });

  it('triangulates quads + triangles without dropping vertices', () => {
    const root = loadObjFormat(objText, { materials });

    let total = 0;
    for (const child of root.objects) {
      const mesh = child.meshes[0];
      // every group is a clean triangle soup
      expect(mesh.vertices.length % 9).toBe(0);
      expect(mesh.normals.length).toBe(mesh.vertices.length);
      expect(mesh.texcoords.length / 2).toBe(mesh.vertices.length / 3);
      expect(mesh.meta.vertexCount).toBe(mesh.vertices.length / 3);
      total += mesh.vertices.length / 3;
    }

    // matches an independent fan-triangulation count of the source file
    expect(total).toBe(expectedTriangleVertexCount(objText) / 1);
  });

  it('applies the .mtl diffuse colours to each group', () => {
    const root = loadObjFormat(objText, { materials });
    const bark = root.objects.find((o: any) => o.name === 'Bark');
    const tree = root.objects.find((o: any) => o.name === 'Tree');

    expect(bark.mat.color[0]).toBeCloseTo(0.207595, 4);
    expect(tree.mat.color[1]).toBeCloseTo(0.440506, 4);
    // OBJ has no PBR data → matte defaults
    expect(bark.mat.roughness).toBeGreaterThan(0.5);
    expect(bark.mat.metallic).toBe(0);
  });

  it('produces unit-length normals', () => {
    const root = loadObjFormat(objText, { materials });
    const n = root.objects[0].meshes[0].normals;
    for (let i = 0; i < Math.min(n.length, 90); i += 3) {
      const len = Math.hypot(n[i], n[i + 1], n[i + 2]);
      expect(len).toBeCloseTo(1, 3);
    }
  });

  it('alignBottom sits the model base on y = 0 and centres it on x/z', () => {
    const root = loadObjFormat(objText, { materials, alignBottom: true });

    let minx = Infinity, maxx = -Infinity, miny = Infinity, minz = Infinity, maxz = -Infinity;
    for (const child of root.objects) {
      const v = child.meshes[0].vertices;
      for (let i = 0; i < v.length; i += 3) {
        minx = Math.min(minx, v[i]); maxx = Math.max(maxx, v[i]);
        miny = Math.min(miny, v[i + 1]);
        minz = Math.min(minz, v[i + 2]); maxz = Math.max(maxz, v[i + 2]);
      }
    }

    expect(miny).toBeCloseTo(0, 4);
    expect((minx + maxx) / 2).toBeCloseTo(0, 4);
    expect((minz + maxz) / 2).toBeCloseTo(0, 4);
  });
});

describe('loadObjFormat (synthetic edge cases)', () => {
  it('keeps a single-material model as a flat object (mesh on the root)', () => {
    const obj = `
      v 0 0 0
      v 1 0 0
      v 0 0 1
      f 1 2 3
    `;
    const root = loadObjFormat(obj);
    expect(root.objects.length).toBe(0);
    expect(root.meshes.length).toBe(1);
    expect(root.meshes[0].vertices.length / 3).toBe(3);
  });

  it('fan-triangulates a quad face into two triangles', () => {
    const obj = `
      v -1 0 -1
      v  1 0 -1
      v  1 0  1
      v -1 0  1
      f 1 2 3 4
    `;
    const root = loadObjFormat(obj);
    expect(root.meshes[0].vertices.length / 3).toBe(6); // 2 triangles
  });

  it('synthesises geometric normals when the face has none', () => {
    const obj = `
      v 0 0 0
      v 1 0 0
      v 0 0 1
      f 1 2 3
    `;
    const root = loadObjFormat(obj);
    const n = root.meshes[0].normals;
    // triangle in the XZ plane → normal is ±Y, unit length
    expect(Math.abs(n[1])).toBeCloseTo(1, 5);
    expect(Math.hypot(n[0], n[1], n[2])).toBeCloseTo(1, 5);
  });
});
