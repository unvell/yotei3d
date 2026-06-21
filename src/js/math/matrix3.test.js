import { describe, it, expect } from 'vitest';
import { Matrix3 } from './matrix3.js';
import { Vec2 } from './vec2.js';

const ENTRIES = ['a1', 'b1', 'c1', 'a2', 'b2', 'c2', 'a3', 'b3', 'c3'];
const expectMatClose = (m, expected, p = 6) => {
  for (const k of ENTRIES) expect(m[k], `entry ${k}`).toBeCloseTo(expected[k], p);
};
const IDENTITY = { a1: 1, b1: 0, c1: 0, a2: 0, b2: 1, c2: 0, a3: 0, b3: 0, c3: 1 };

describe('Matrix3 identity', () => {
  it('loadIdentity sets the identity matrix', () => {
    expectMatClose(new Matrix3().loadIdentity(), IDENTITY);
  });

  it('the shared Matrix3.identity is the identity', () => {
    expectMatClose(Matrix3.identity, IDENTITY);
  });
});

describe('Matrix3 factories', () => {
  it('makeTranslation', () => {
    expectMatClose(Matrix3.makeTranslation(5, 7), { ...IDENTITY, a3: 5, b3: 7 });
  });

  it('makeScale', () => {
    expectMatClose(Matrix3.makeScale(2, 3), { ...IDENTITY, a1: 2, b2: 3 });
  });

  it('makeRotation(90)', () => {
    expectMatClose(Matrix3.makeRotation(90), { a1: 0, b1: 1, c1: 0, a2: -1, b2: 0, c2: 0, a3: 0, b3: 0, c3: 1 });
  });
});

describe('Matrix3 in-place ops', () => {
  it('translate accumulates onto the translation column', () => {
    expectMatClose(new Matrix3().loadIdentity().translate(3, 4), { ...IDENTITY, a3: 3, b3: 4 });
  });

  it('scale multiplies the basis rows', () => {
    expectMatClose(new Matrix3().loadIdentity().scale(2, 3), { ...IDENTITY, a1: 2, b2: 3 });
  });

  it('transpose twice is identity (round-trip)', () => {
    const m = Matrix3.makeRotation(30, 4, 5);
    const original = m.clone();
    m.transpose().transpose();
    expectMatClose(m, original);
  });
});

describe('Matrix3 multiplication', () => {
  it('identity is a neutral element', () => {
    const m = Matrix3.makeRotation(33, 2, 9);
    expectMatClose(Matrix3.identity.mul(m), m);
    expectMatClose(m.mul(Matrix3.identity), m);
  });
});

describe('Matrix3 inverse', () => {
  it('M * inverse(M) = identity', () => {
    const m = Matrix3.makeTranslation(5, 7).mul(Matrix3.makeRotation(40));
    expectMatClose(m.mul(m.inverse()), IDENTITY);
  });

  it('inverse returns a new matrix (does not mutate the source)', () => {
    const m = Matrix3.makeRotation(25);
    const before = m.clone();
    m.inverse();
    expectMatClose(m, before);
  });

  it('a singular matrix returns a clone instead of dividing by zero', () => {
    const singular = Matrix3.makeScale(0, 0);
    expect(() => singular.inverse()).not.toThrow();
  });
});

describe('Matrix3 with Vec2', () => {
  it('rotation by 90 maps (1,0) to (0,1)', () => {
    const r = new Vec2(1, 0).mulMat(Matrix3.makeRotation(90));
    expect(r.x).toBeCloseTo(0, 6);
    expect(r.y).toBeCloseTo(1, 6);
  });
});
