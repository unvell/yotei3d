import { describe, it, expect } from 'vitest';
import { Vec3 } from './vec3.js';
import { Vec4 } from './vec4.js';
import { Matrix4 } from './matrix4.js';

const close = (a, b, p = 6) => expect(a).toBeCloseTo(b, p);
const closeVec = (v, [x, y, z, w], p = 5) => {
  close(v.x, x, p); close(v.y, y, p); close(v.z, z, p); close(v.w, w, p);
};

describe('Vec4 construction', () => {
  it('defaults to (0,0,0,0)', () => {
    expect(new Vec4().toArray()).toEqual([0, 0, 0, 0]);
  });

  it('takes (x, y, z, w)', () => {
    expect(new Vec4(1, 2, 3, 4).toArray()).toEqual([1, 2, 3, 4]);
  });

  it('three components default w to 1', () => {
    expect(new Vec4(1, 2, 3).toArray()).toEqual([1, 2, 3, 1]);
  });

  it('from a Vec3 sets w to 1', () => {
    expect(new Vec4(new Vec3(1, 2, 3)).toArray()).toEqual([1, 2, 3, 1]);
  });

  it('from a Vec3 plus explicit w', () => {
    expect(new Vec4(new Vec3(1, 2, 3), 5).toArray()).toEqual([1, 2, 3, 5]);
  });

  it('copies from another Vec4', () => {
    expect(new Vec4(new Vec4(1, 2, 3, 4)).toArray()).toEqual([1, 2, 3, 4]);
  });

  it('xyz returns a Vec3 of the first three components', () => {
    const xyz = new Vec4(1, 2, 3, 4).xyz;
    expect(xyz).toBeInstanceOf(Vec3);
    expect(xyz.toArray()).toEqual([1, 2, 3]);
  });
});

describe('Vec4 arithmetic', () => {
  it('add / sub', () => {
    expect(new Vec4(1, 2, 3, 4).add(new Vec4(1, 1, 1, 1)).toArray()).toEqual([2, 3, 4, 5]);
    expect(new Vec4(1, 2, 3, 4).sub(new Vec4(1, 1, 1, 1)).toArray()).toEqual([0, 1, 2, 3]);
  });

  it('mul / div by scalar', () => {
    expect(new Vec4(1, 2, 3, 4).mul(2).toArray()).toEqual([2, 4, 6, 8]);
    expect(new Vec4(2, 4, 6, 8).div(2).toArray()).toEqual([1, 2, 3, 4]);
  });

  it('neg / dot', () => {
    expect(new Vec4(1, -2, 3, -4).neg().toArray()).toEqual([-1, 2, -3, 4]);
    expect(new Vec4(1, 2, 3, 4).dot(new Vec4(1, 1, 1, 1))).toBe(10);
  });

  it('length / normalize', () => {
    expect(new Vec4(1, 1, 1, 1).length()).toBe(2); // sqrt(4)
    close(new Vec4(0, 0, 0, 5).normalize().length(), 1);
  });
});

describe('Vec4 lerp', () => {
  it('interpolates each component linearly', () => {
    const a = new Vec4(0, 0, 0, 0);
    const b = new Vec4(10, 20, 30, 40);
    closeVec(a.lerp(b, 0.5), [5, 10, 15, 20]);
    closeVec(a.lerp(b, 0), [0, 0, 0, 0]);
    closeVec(a.lerp(b, 1), [10, 20, 30, 40]);
  });
});

describe('Vec4 mulMat', () => {
  it('identity leaves the vector unchanged', () => {
    closeVec(new Vec4(1, 2, 3, 1).mulMat(new Matrix4().loadIdentity()), [1, 2, 3, 1]);
  });

  it('applies a translation to a point (w=1)', () => {
    const m = new Matrix4().loadIdentity().translate(10, 20, 30);
    closeVec(new Vec4(1, 2, 3, 1).mulMat(m), [11, 22, 33, 1]);
  });

  it('a direction (w=0) is unaffected by translation', () => {
    const m = new Matrix4().loadIdentity().translate(10, 20, 30);
    closeVec(new Vec4(1, 2, 3, 0).mulMat(m), [1, 2, 3, 0]);
  });
});
