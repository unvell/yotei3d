import { describe, it, expect } from 'vitest';
import { Vec3 } from './vec3.js';
import { Matrix3 } from './matrix3.js';
import { MathFunctions3 } from './functions3.js';

const close = (a, b, p = 5) => expect(a).toBeCloseTo(b, p);
const closeVec = (v, [x, y, z], p = 5) => {
  close(v.x, x, p); close(v.y, y, p); close(v.z, z, p);
};

// These three functions used to throw when called (they referenced unimported
// or undefined symbols). They are now implemented as a consistent set.

describe('Vec3.fromEulers (pitch, yaw in degrees -> unit direction)', () => {
  it('zero angles point along +Z', () => {
    closeVec(new Vec3().fromEulers(0, 0), [0, 0, 1]);
  });

  it('pitch 90 points along +Y', () => {
    closeVec(new Vec3().fromEulers(90, 0), [0, 1, 0]);
  });

  it('yaw 90 points along +X', () => {
    closeVec(new Vec3().fromEulers(0, 90), [1, 0, 0]);
  });

  it('always yields a unit vector', () => {
    close(new Vec3().fromEulers(33, 57).length(), 1);
  });
});

describe('MathFunctions3.eulerAnglesFromVectors', () => {
  it('is the exact inverse of Vec3.fromEulers', () => {
    const pitch = 25, yaw = -40;
    const dir = new Vec3().fromEulers(pitch, yaw);
    const e = MathFunctions3.eulerAnglesFromVectors(dir, new Vec3(0, 0, 0));
    close(e.x, pitch, 4); // pitch
    close(e.y, yaw, 4);   // yaw
    close(e.z, 0, 4);     // roll
  });

  it('measures the direction from v2 to v1 (straight up -> 90deg pitch)', () => {
    const e = MathFunctions3.eulerAnglesFromVectors(new Vec3(0, 1, 0), new Vec3(0, 0, 0));
    close(e.x, 90, 4);
  });
});

describe('Matrix3.extractEulerAngles', () => {
  it('identity yields zero angles', () => {
    closeVec(Matrix3.identity.extractEulerAngles(), [0, 0, 0]);
  });

  it('recovers a 15deg in-plane (Z) rotation', () => {
    closeVec(Matrix3.makeRotation(15).extractEulerAngles(), [0, 0, 15], 4);
  });

  it('does not throw (regression: previously referenced an unimported symbol)', () => {
    expect(() => Matrix3.makeRotation(40).extractEulerAngles()).not.toThrow();
  });
});
