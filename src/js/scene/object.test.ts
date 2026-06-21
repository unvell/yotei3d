import { describe, it, expect } from 'vitest';
import { SceneObject } from './object';
import { Quaternion, Vec3 } from '@/math';

const close = (a: number, b: number, p = 5) => expect(a).toBeCloseTo(b, p);

describe('SceneObject.updateTransform', () => {
  it('a fresh object has an identity transform', () => {
    const o = new SceneObject();
    o.updateTransform();
    expect(o.transform.toArray()).toEqual(
      [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  });

  it('applies translation and scale to the stored transform', () => {
    const o = new SceneObject();
    o.location = new Vec3(1, 2, 3);
    o.scale = new Vec3(2, 3, 4);
    o.updateTransform();
    const t = o.transform;
    expect([t.a4, t.b4, t.c4]).toEqual([1, 2, 3]);
    close(t.a1, 2); close(t.b2, 3); close(t.c3, 4);
  });

  it('experimental quaternion rotation lands on the stored transform (regression)', () => {
    const o = new SceneObject();
    // 90deg about Y. toMatrix() rotates the X axis onto +X column index 3.
    o._quaternion = Quaternion.fromEuler({ x: 0, y: 90, z: 0 });
    o.scale = new Vec3(2, 2, 2); // makes the transform branch execute
    o.updateTransform();
    const t = o.transform;
    // After the fix the rotation is present: a1 ~ 0 and |a3| ~ 2 (Ry(90) * scale 2).
    // Before the fix the stored transform was a pure scale (a1 = 2, a3 = 0).
    close(t.a1, 0);
    close(Math.abs(t.a3), 2);
  });
});

describe('SceneObject.setWorldRotation <-> getWorldRotation (root object)', () => {
  it.each([
    ['X', new Vec3(20, 0, 0)],
    ['Y', new Vec3(0, 30, 0)],
    ['Z', new Vec3(0, 0, 15)],
  ] as const)('round-trips a single-axis %s rotation', (_axis, rot) => {
    const o = new SceneObject();
    o.setWorldRotation(rot);
    const w = o.getWorldRotation();
    close(w.x, rot.x, 3);
    close(w.y, rot.y, 3);
    close(w.z, rot.z, 3);
  });
});
