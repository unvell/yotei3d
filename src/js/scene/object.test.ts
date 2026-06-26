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

describe('SceneObject transform dirty-flag / lazy resolve', () => {
  it('editing TRS marks the transform dirty and resolves lazily on read', () => {
    const o = new SceneObject();
    o.updateTransform();
    expect(o._transformDirty).toBe(false);

    o.location = new Vec3(5, 0, 0);
    expect(o._transformDirty).toBe(true);   // not recomputed yet

    // reading through the getter resolves it
    const t = o.transform;
    expect(o._transformDirty).toBe(false);
    expect([t.a4, t.b4, t.c4]).toEqual([5, 0, 0]);
  });

  it('multi-component edits compose at most once (deferred until read)', () => {
    const o = new SceneObject();
    o.updateTransform();

    let composes = 0;
    const orig = o._composeTransform.bind(o);
    o._composeTransform = () => { composes++; orig(); };

    o.location.x = 1;
    o.location.y = 2;
    o.location.z = 3;
    expect(composes).toBe(0);   // nothing recomputed during the edits

    void o.transform;           // single resolve
    expect(composes).toBe(1);
  });

  it('a parent edit propagates to the child world location lazily', () => {
    const parent = new SceneObject();
    const child = new SceneObject();
    parent.add(child);
    child.location = new Vec3(1, 0, 0);

    expect(child.worldLocation.x).toBeCloseTo(1, 5);

    parent.location = new Vec3(10, 0, 0);
    expect(child._transformDirty).toBe(true);      // marked via subtree invalidation
    expect(child.worldLocation.x).toBeCloseTo(11, 5);   // resolved on read
  });

  it('uniform scale takes the conformal fast path (normal matrix == world matrix)', () => {
    const o = new SceneObject();
    o.location = new Vec3(2, 0, 0);
    o.angle = new Vec3(0, 30, 0);
    o.scale = new Vec3(3, 3, 3);
    o.updateTransform();

    expect(o._conformal).toBe(true);
    expect(o._normalTransform.approxiEquals(o._transform)).toBe(true);
  });

  it('non-uniform scale uses the inverse-transpose normal matrix', () => {
    const o = new SceneObject();
    o.scale = new Vec3(2, 1, 1);
    o.updateTransform();

    expect(o._conformal).toBe(false);
    // normal matrix scales x by 1/2 (inverse-transpose), not by 2
    close(o._normalTransform.a1, 0.5);
    expect(o._normalTransform.approxiEquals(o._transform)).toBe(false);
  });

  it('non-uniform scale on an ancestor makes descendants non-conformal', () => {
    const parent = new SceneObject();
    const child = new SceneObject();
    parent.add(child);

    parent.scale = new Vec3(2, 1, 1);   // non-uniform on parent
    child.scale = new Vec3(1, 1, 1);    // uniform locally

    void child.transform;               // resolve
    expect(child._conformal).toBe(false);
  });
});
