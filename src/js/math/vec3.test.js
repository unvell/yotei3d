import { describe, it, expect } from 'vitest';
import { Vec3 } from './vec3.js';
import { Matrix4 } from './matrix4.js';

const close = (a, b, p = 6) => expect(a).toBeCloseTo(b, p);
const closeVec = (v, [x, y, z], p = 5) => {
  close(v.x, x, p); close(v.y, y, p); close(v.z, z, p);
};

describe('Vec3 construction', () => {
  it('defaults to (0,0,0)', () => {
    expect(new Vec3().toArray()).toEqual([0, 0, 0]);
  });

  it('takes (x, y, z)', () => {
    expect(new Vec3(1, 2, 3).toArray()).toEqual([1, 2, 3]);
  });

  it('a single number fills all components', () => {
    expect(new Vec3(5).toArray()).toEqual([5, 5, 5]);
  });

  it('copies from another vector', () => {
    expect(new Vec3(new Vec3(7, 8, 9)).toArray()).toEqual([7, 8, 9]);
  });

  it('fromArray', () => {
    expect(Vec3.fromArray([4, 5, 6]).toArray()).toEqual([4, 5, 6]);
  });

  it('xy returns a Vec2 of the first two components', () => {
    const xy = new Vec3(1, 2, 3).xy;
    expect([xy.x, xy.y]).toEqual([1, 2]);
  });
});

describe('Vec3 arithmetic', () => {
  it('add / sub (instance and static)', () => {
    expect(new Vec3(1, 2, 3).add(new Vec3(4, 5, 6)).toArray()).toEqual([5, 7, 9]);
    expect(new Vec3(4, 5, 6).sub(new Vec3(1, 2, 3)).toArray()).toEqual([3, 3, 3]);
    expect(Vec3.add(new Vec3(1, 1, 1), new Vec3(2, 2, 2)).toArray()).toEqual([3, 3, 3]);
    expect(Vec3.sub(new Vec3(3, 3, 3), new Vec3(1, 1, 1)).toArray()).toEqual([2, 2, 2]);
  });

  it('mul / div by scalar', () => {
    expect(new Vec3(1, 2, 3).mul(2).toArray()).toEqual([2, 4, 6]);
    expect(new Vec3(2, 4, 6).div(2).toArray()).toEqual([1, 2, 3]);
    expect(Vec3.mul(new Vec3(1, 2, 3), 3).toArray()).toEqual([3, 6, 9]);
  });

  it('neg / abs', () => {
    expect(new Vec3(1, -2, 3).neg().toArray()).toEqual([-1, 2, -3]);
    expect(new Vec3(-1, -2, -3).abs().toArray()).toEqual([1, 2, 3]);
  });

  it('offset mutates and returns this', () => {
    const v = new Vec3(1, 1, 1);
    expect(v.offset(1, 2, 3)).toBe(v);
    expect(v.toArray()).toEqual([2, 3, 4]);
    v.offset(new Vec3(1, 1, 1));
    expect(v.toArray()).toEqual([3, 4, 5]);
  });
});

describe('Vec3 geometry', () => {
  it('length', () => {
    expect(new Vec3(2, 3, 6).length()).toBe(7); // sqrt(4+9+36)=7
    expect(Vec3.length(new Vec3(2, 3, 6))).toBe(7);
  });

  it('normalize yields a unit vector', () => {
    const n = new Vec3(0, 3, 4).normalize();
    close(n.length(), 1);
    closeVec(n, [0, 0.6, 0.8]);
  });

  it('normalize of the zero vector returns zero (no NaN)', () => {
    expect(new Vec3(0, 0, 0).normalize().toArray()).toEqual([0, 0, 0]);
  });

  it('dot product', () => {
    expect(new Vec3(1, 2, 3).dot(new Vec3(4, 5, 6))).toBe(32);
    expect(Vec3.dot(new Vec3(1, 0, 0), new Vec3(0, 1, 0))).toBe(0);
  });

  it('cross product follows the right-hand rule (X × Y = Z)', () => {
    closeVec(new Vec3(1, 0, 0).cross(new Vec3(0, 1, 0)), [0, 0, 1]);
    closeVec(new Vec3(0, 1, 0).cross(new Vec3(0, 0, 1)), [1, 0, 0]);
    closeVec(Vec3.cross(new Vec3(0, 0, 1), new Vec3(1, 0, 0)), [0, 1, 0]);
  });

  it('cross of parallel vectors is zero', () => {
    closeVec(new Vec3(1, 2, 3).cross(new Vec3(2, 4, 6)), [0, 0, 0]);
  });

  it('lerp interpolates linearly', () => {
    closeVec(new Vec3(0, 0, 0).lerp(new Vec3(10, 20, 30), 0.5), [5, 10, 15]);
    closeVec(Vec3.lerp(new Vec3(0, 0, 0), new Vec3(10, 0, 0), 0), [0, 0, 0]);
    closeVec(Vec3.lerp(new Vec3(0, 0, 0), new Vec3(10, 0, 0), 1), [10, 0, 0]);
  });
});

describe('Vec3 equality', () => {
  it('equals (1-arg and 3-arg)', () => {
    expect(new Vec3(1, 2, 3).equals(new Vec3(1, 2, 3))).toBe(true);
    expect(new Vec3(1, 2, 3).equals(1, 2, 3)).toBe(true);
    expect(new Vec3(1, 2, 3).equals(new Vec3(1, 2, 4))).toBe(false);
  });

  it('approxiEquals tolerates tiny error', () => {
    expect(new Vec3(1, 2, 3).approxiEquals(new Vec3(1, 2, 3.000001))).toBe(true);
    expect(new Vec3(1, 2, 3).approxiEquals(new Vec3(1, 2, 3.1))).toBe(false);
  });
});

describe('Vec3 named constants', () => {
  it('directional unit vectors (right-handed, -Z forward)', () => {
    expect(Vec3.up.toArray()).toEqual([0, 1, 0]);
    expect(Vec3.down.toArray()).toEqual([0, -1, 0]);
    expect(Vec3.right.toArray()).toEqual([1, 0, 0]);
    expect(Vec3.left.toArray()).toEqual([-1, 0, 0]);
    expect(Vec3.forward.toArray()).toEqual([0, 0, -1]);
    expect(Vec3.back.toArray()).toEqual([0, 0, 1]);
  });
});

describe('Vec3 mulMat', () => {
  it('identity leaves the vector unchanged', () => {
    const v = new Vec3(1, 2, 3).mulMat(new Matrix4().loadIdentity());
    closeVec(v, [1, 2, 3]);
  });

  it('rotateX(90) maps +Y to +Z', () => {
    const m = new Matrix4().loadIdentity().rotateX(90);
    closeVec(new Vec3(0, 1, 0).mulMat(m), [0, 0, 1]);
  });
});
