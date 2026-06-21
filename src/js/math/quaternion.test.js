import { describe, it, expect } from 'vitest';
import { Quaternion } from './quaternion.js';
import { Matrix4 } from './matrix4.js';

const close = (a, b, p = 5) => expect(a).toBeCloseTo(b, p);

describe('Quaternion basics', () => {
  it('length', () => {
    expect(new Quaternion(0, 0, 0, 2).length()).toBe(2);
    expect(new Quaternion(1, 1, 1, 1).length()).toBe(2);
  });

  it('normalize yields a unit quaternion', () => {
    close(new Quaternion(1, 2, 3, 4).normalize().length(), 1);
  });

  it('normalize of a (near-)zero quaternion collapses to identity without leaking the shared singleton (regression)', () => {
    const q = new Quaternion(0, 0, 0, 0);
    const n = q.normalize();
    expect(n).toBe(q);                       // returns `this`, not Quaternion.zero
    expect(n.toArray()).toEqual([0, 0, 0, 1]); // identity rotation
    n.w = 999;                               // mutating the result...
    expect(Quaternion.zero.w).toBe(1);       // ...must not corrupt the global constant
  });
});

describe('Quaternion.fromEuler', () => {
  it('zero angles give the identity quaternion', () => {
    expect(Quaternion.fromEuler({ x: 0, y: 0, z: 0 }).toArray()).toEqual([0, 0, 0, 1]);
  });

  it('90deg about Y matches Matrix4.rotateY(90)', () => {
    const fromQ = Quaternion.fromEuler({ x: 0, y: 90, z: 0 }).toMatrix();
    const fromM = new Matrix4().loadIdentity().rotateY(90);
    expect(fromQ.approxiEquals(fromM)).toBe(true);
  });
});

describe('Quaternion.toMatrix', () => {
  it('identity quaternion -> identity matrix', () => {
    const m = new Quaternion(0, 0, 0, 1).toMatrix();
    expect(m.approxiEquals(new Matrix4().loadIdentity())).toBe(true);
  });
});

describe('Quaternion.multiply', () => {
  it('identity is a neutral element', () => {
    const q = Quaternion.fromEuler({ x: 10, y: 20, z: 30 });
    const r = Quaternion.multiply(new Quaternion(0, 0, 0, 1), q);
    close(r.x, q.x); close(r.y, q.y); close(r.z, q.z); close(r.w, q.w);
  });
});

describe('Quaternion.slerp', () => {
  it('returns the endpoints at t=0 and t=1', () => {
    const a = Quaternion.fromEuler({ x: 0, y: 0, z: 0 });
    const b = Quaternion.fromEuler({ x: 0, y: 90, z: 0 });
    expect(Quaternion.slerp(a, b, 0)).toBe(a);
    expect(Quaternion.slerp(a, b, 1)).toBe(b);
  });

  it('the midpoint is a unit quaternion', () => {
    const a = Quaternion.fromEuler({ x: 0, y: 0, z: 0 });
    const b = Quaternion.fromEuler({ x: 0, y: 90, z: 0 });
    close(Quaternion.slerp(a, b, 0.5).length(), 1);
  });
});

describe('Quaternion inverse (true inverse, not just conjugate)', () => {
  it('q * inverse(q) = identity for a unit quaternion', () => {
    const q = Quaternion.fromEuler({ x: 0, y: 90, z: 0 });
    const r = Quaternion.multiply(q, Quaternion.inverse(q));
    close(r.x, 0); close(r.y, 0); close(r.z, 0); close(r.w, 1);
  });

  it('q * inverse(q) = identity for a NON-unit quaternion (regression)', () => {
    const q = new Quaternion(0, 1, 0, 1); // |q|^2 = 2
    const r = Quaternion.multiply(q, Quaternion.inverse(q));
    close(r.x, 0); close(r.y, 0); close(r.z, 0); close(r.w, 1);
  });
});

describe('Quaternion <-> rotation matrix round-trip', () => {
  it('fromRotationMatrix(toMatrix(q)) represents the same rotation', () => {
    const q = Quaternion.fromEuler({ x: 0, y: 90, z: 0 });
    const m1 = q.toMatrix();
    const m2 = Quaternion.fromRotationMatrix(m1).toMatrix();
    expect(m2.approxiEquals(m1)).toBe(true);
  });
});
