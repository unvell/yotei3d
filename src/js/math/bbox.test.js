import { describe, it, expect } from 'vitest';
import { Vec2 } from './vec2.js';
import { Vec3 } from './vec3.js';
import { Matrix4 } from './matrix4.js';
import { BoundingBox3D } from './bbox3.js';
import { BoundingBox2D } from './bbox2.js';

describe('BoundingBox3D construction', () => {
  it('size and origin from min/max', () => {
    const b = new BoundingBox3D(new Vec3(0, 0, 0), new Vec3(10, 10, 10));
    expect(b.size.toArray()).toEqual([10, 10, 10]);
    expect(b.origin.toArray()).toEqual([5, 5, 5]);
  });
});

describe('BoundingBox3D.expandTo / initTo keep size & origin in sync', () => {
  it('origin reflects the center after expandTo (regression: makeDirty)', () => {
    const b = new BoundingBox3D();
    b.initTo(new Vec3(0, 0, 0));
    b.expandTo(new Vec3(10, 10, 10));
    // before the fix, origin stayed (0,0,0) because the cache was never invalidated
    expect(b.origin.toArray()).toEqual([5, 5, 5]);
    expect(b.size.toArray()).toEqual([10, 10, 10]);
  });

  it('fromPoints computes min/max/origin', () => {
    const b = BoundingBox3D.fromPoints([
      new Vec3(0, 0, 0), new Vec3(10, 20, 30), new Vec3(-5, 0, 0),
    ]);
    expect(b.min.toArray()).toEqual([-5, 0, 0]);
    expect(b.max.toArray()).toEqual([10, 20, 30]);
    expect(b.origin.toArray()).toEqual([2.5, 10, 15]);
  });
});

describe('BoundingBox3D.containsPoint (regression: Y/Z axis typos)', () => {
  const b = new BoundingBox3D(new Vec3(0, 0, 0), new Vec3(10, 10, 10));
  it('an interior point is contained', () => {
    expect(b.containsPoint(new Vec3(5, 5, 5))).toBe(true);
  });
  it('a point outside on Y is rejected', () => {
    expect(b.containsPoint(new Vec3(5, 15, 5))).toBe(false);
  });
  it('a point outside on Z is rejected', () => {
    expect(b.containsPoint(new Vec3(5, 5, 15))).toBe(false);
  });
});

describe('BoundingBox3D static combinators', () => {
  it('findBoundingBoxOfBoundingBoxes unions two boxes', () => {
    const a = new BoundingBox3D(new Vec3(0, 0, 0), new Vec3(2, 2, 2));
    const c = new BoundingBox3D(new Vec3(-1, 1, 5), new Vec3(1, 3, 6));
    const u = BoundingBox3D.findBoundingBoxOfBoundingBoxes(a, c);
    expect(u.min.toArray()).toEqual([-1, 0, 0]);
    expect(u.max.toArray()).toEqual([2, 3, 6]);
  });

  it('transformBoundingBox applies a translation', () => {
    const a = new BoundingBox3D(new Vec3(0, 0, 0), new Vec3(2, 2, 2));
    const m = new Matrix4().loadIdentity().translate(5, 0, 0);
    const t = BoundingBox3D.transformBoundingBox(a, m);
    expect(t.min.toArray()).toEqual([5, 0, 0]);
    expect(t.max.toArray()).toEqual([7, 2, 2]);
  });
});

describe('BoundingBox2D', () => {
  it('width / height / size / origin', () => {
    const b = new BoundingBox2D(new Vec2(0, 0), new Vec2(10, 20));
    expect(b.width).toBe(10);
    expect(b.height).toBe(20);
    expect(b.size).toEqual({ width: 10, height: 20 });
    expect([b.origin.x, b.origin.y]).toEqual([5, 10]);
  });

  it('from4Points uses Y components for max.y (regression)', () => {
    const b = BoundingBox2D.from4Points(
      new Vec2(0, 0), new Vec2(10, 0), new Vec2(10, 20), new Vec2(0, 20));
    expect([b.min.x, b.min.y]).toEqual([0, 0]);
    expect([b.max.x, b.max.y]).toEqual([10, 20]);
  });

  it('containsPoint includes the boundary', () => {
    const b = new BoundingBox2D(new Vec2(0, 0), new Vec2(10, 10));
    expect(b.containsPoint(new Vec2(5, 5))).toBe(true);
    expect(b.containsPoint(new Vec2(0, 0))).toBe(true);
    expect(b.containsPoint(new Vec2(11, 5))).toBe(false);
  });

  it('intersectsBBox2D returns true on overlap (regression: missing return)', () => {
    const a = new BoundingBox2D(new Vec2(0, 0), new Vec2(10, 10));
    const overlap = new BoundingBox2D(new Vec2(5, 5), new Vec2(15, 15));
    const disjoint = new BoundingBox2D(new Vec2(20, 20), new Vec2(30, 30));
    expect(a.intersectsBBox2D(overlap)).toBe(true);
    expect(a.intersectsBBox2D(disjoint)).toBe(false);
  });

  it('fromTwoPoints normalizes min/max', () => {
    const b = BoundingBox2D.fromTwoPoints(new Vec2(10, 20), new Vec2(0, 5));
    expect([b.min.x, b.min.y]).toEqual([0, 5]);
    expect([b.max.x, b.max.y]).toEqual([10, 20]);
  });
});
