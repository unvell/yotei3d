import { describe, it, expect } from 'vitest';
import { Vec2 } from './vec2.js';
import { Matrix3 } from './matrix3.js';

const close = (a, b, p = 6) => expect(a).toBeCloseTo(b, p);

describe('Vec2 construction', () => {
  it('defaults to (0,0)', () => {
    const v = new Vec2();
    expect([v.x, v.y]).toEqual([0, 0]);
  });

  it('takes (x, y)', () => {
    const v = new Vec2(3, 4);
    expect([v.x, v.y]).toEqual([3, 4]);
  });

  it('takes an array', () => {
    const v = new Vec2([5, 6]);
    expect([v.x, v.y]).toEqual([5, 6]);
  });

  it('takes another vector-like object', () => {
    const v = new Vec2({ x: 7, y: 8 });
    expect([v.x, v.y]).toEqual([7, 8]);
  });

  it('clone is an independent copy', () => {
    const a = new Vec2(1, 2);
    const b = a.clone();
    b.x = 99;
    expect(a.x).toBe(1);
    expect([b.x, b.y]).toEqual([99, 2]);
  });
});

describe('Vec2 arithmetic', () => {
  it('add (instance and static)', () => {
    expect(new Vec2(1, 2).add(new Vec2(3, 4))).toMatchObject({ x: 4, y: 6 });
    expect(Vec2.add(new Vec2(1, 2), new Vec2(3, 4))).toMatchObject({ x: 4, y: 6 });
  });

  it('sub (instance and static)', () => {
    expect(new Vec2(5, 7).sub(new Vec2(1, 2))).toMatchObject({ x: 4, y: 5 });
    expect(Vec2.sub(new Vec2(5, 7), new Vec2(1, 2))).toMatchObject({ x: 4, y: 5 });
  });

  it('mul by scalar and component-wise', () => {
    expect(new Vec2(2, 3).mul(2)).toMatchObject({ x: 4, y: 6 });
    expect(new Vec2(2, 3).mul(new Vec2(4, 5))).toMatchObject({ x: 8, y: 15 });
  });

  it('div by scalar and component-wise', () => {
    expect(new Vec2(8, 6).div(2)).toMatchObject({ x: 4, y: 3 });
    expect(new Vec2(8, 6).div(new Vec2(2, 3))).toMatchObject({ x: 4, y: 2 });
  });

  it('neg', () => {
    expect(new Vec2(1, -2).neg()).toMatchObject({ x: -1, y: 2 });
  });

  it('abs', () => {
    expect(new Vec2(-3, -4).abs()).toMatchObject({ x: 3, y: 4 });
  });

  it('scale mutates in place', () => {
    const v = new Vec2(2, 3);
    v.scale(10, 100);
    expect([v.x, v.y]).toEqual([20, 300]);
  });

  it('offset mutates in place', () => {
    const v = new Vec2(1, 1);
    v.offset(2, 3);
    expect([v.x, v.y]).toEqual([3, 4]);
    v.offset(new Vec2(1, 1));
    expect([v.x, v.y]).toEqual([4, 5]);
  });
});

describe('Vec2 geometry', () => {
  it('length / magnitude of a 3-4-5 triangle', () => {
    const v = new Vec2(3, 4);
    expect(v.length()).toBe(5);
    expect(v.magnitude).toBe(5);
    expect(Vec2.length(v)).toBe(5);
  });

  it('lengthBetween', () => {
    expect(Vec2.lengthBetween(new Vec2(0, 0), new Vec2(3, 4))).toBe(5);
  });

  it('normalize yields a unit vector', () => {
    const n = new Vec2(3, 4).normalize();
    close(n.length(), 1);
    close(n.x, 0.6);
    close(n.y, 0.8);
  });

  it('dot product', () => {
    expect(new Vec2(1, 2).dot(new Vec2(3, 4))).toBe(11);
    expect(Vec2.dot(new Vec2(1, 0), new Vec2(0, 1))).toBe(0);
  });

  it('angle is measured CCW from +X in degrees (0..360)', () => {
    close(new Vec2(1, 0).angle, 0);
    close(new Vec2(0, 1).angle, 90);
    close(new Vec2(-1, 0).angle, 180);
    close(new Vec2(0, -1).angle, 270);
  });

  it('angleOf between two points', () => {
    close(Vec2.angleOf(new Vec2(0, 0), new Vec2(1, 1)), 45);
  });
});

describe('Vec2 equality', () => {
  it('equals is exact', () => {
    expect(new Vec2(1, 2).equals(new Vec2(1, 2))).toBe(true);
    expect(new Vec2(1, 2).equals(new Vec2(1, 2.0000001))).toBe(false);
  });

  it('approxiEquals tolerates tiny error', () => {
    expect(new Vec2(1, 2).approxiEquals(new Vec2(1, 2.000001))).toBe(true);
    expect(new Vec2(1, 2).approxiEquals(new Vec2(1, 2.1))).toBe(false);
  });
});

describe('Vec2 mulMat (Matrix3 affine transform)', () => {
  it('applies a 2D translation', () => {
    const m = Matrix3.makeTranslation(10, 20);
    const v = new Vec2(1, 2).mulMat(m);
    expect([v.x, v.y]).toEqual([11, 22]);
  });
});
