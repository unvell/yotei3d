import { describe, it, expect } from 'vitest';
import { Matrix4 } from './matrix4.js';
import { Vec3 } from './vec3.js';

const close = (a, b, p = 6) => expect(a).toBeCloseTo(b, p);
const closeVec = (v, [x, y, z], p = 5) => {
  close(v.x, x, p); close(v.y, y, p); close(v.z, z, p);
};
const expectIdentity = (m, p = 6) => {
  const I = new Matrix4().loadIdentity();
  expect(m.approxiEquals(I, Math.pow(10, -p))).toBe(true);
};

describe('Matrix4 identity & translate', () => {
  it('loadIdentity', () => {
    const m = new Matrix4().loadIdentity();
    expect(m.toArray()).toEqual([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  });

  it('translate writes into the translation column (a4,b4,c4)', () => {
    const m = new Matrix4().loadIdentity().translate(10, 20, 30);
    expect([m.a4, m.b4, m.c4, m.d4]).toEqual([10, 20, 30, 1]);
  });

  it('scale multiplies the basis rows', () => {
    const m = new Matrix4().loadIdentity().scale(2, 3, 4);
    expect([m.a1, m.b2, m.c3]).toEqual([2, 3, 4]);
  });
});

describe('Matrix4 axis rotations (right-handed, degrees)', () => {
  it('rotateX(90): +Y -> +Z', () => {
    const m = new Matrix4().loadIdentity().rotateX(90);
    closeVec(new Vec3(0, 1, 0).mulMat(m), [0, 0, 1]);
  });

  it('rotateY(90): +Z -> +X', () => {
    const m = new Matrix4().loadIdentity().rotateY(90);
    closeVec(new Vec3(0, 0, 1).mulMat(m), [1, 0, 0]);
  });

  it('rotateZ(90): +X -> +Y', () => {
    const m = new Matrix4().loadIdentity().rotateZ(90);
    closeVec(new Vec3(1, 0, 0).mulMat(m), [0, 1, 0]);
  });

  it('a full 360 rotation is the identity', () => {
    const m = new Matrix4().loadIdentity().rotateX(360);
    closeVec(new Vec3(1, 2, 3).mulMat(m), [1, 2, 3]);
  });
});

describe('Matrix4 multiplication', () => {
  it('identity is a neutral element', () => {
    const m = new Matrix4().loadIdentity().translate(1, 2, 3).rotateY(35);
    const I = new Matrix4().loadIdentity();
    expect(m.mul(I).approxiEquals(m)).toBe(true);
    expect(I.mul(m).approxiEquals(m)).toBe(true);
  });
});

describe('Matrix4 inverse', () => {
  it('M * inverse(M) = identity', () => {
    const m = new Matrix4().loadIdentity().translate(4, -2, 7).rotateY(30).rotateX(15).scale(2, 3, 0.5);
    expectIdentity(m.mul(m.inverse()));
  });

  it('inverse() does not mutate the source', () => {
    const m = new Matrix4().loadIdentity().translate(4, -2, 7).rotateY(30).scale(2, 3, 0.5);
    const original = m.clone();
    m.inverse();
    expect(m.approxiEquals(original)).toBe(true);
  });

  it('invertInPlace() mutates and returns this', () => {
    const m = new Matrix4().loadIdentity().translate(4, -2, 7).rotateX(15).scale(2, 3, 0.5);
    const expected = m.inverse();
    const ret = m.invertInPlace();
    expect(ret).toBe(m);
    expect(m.approxiEquals(expected)).toBe(true);
  });

  it('canInverse reflects invertibility', () => {
    expect(new Matrix4().loadIdentity().canInverse()).toBe(true);
    expect(new Matrix4().loadIdentity().scale(0, 1, 1).canInverse()).toBe(false);
  });
});

describe('Matrix4 transpose', () => {
  it('transpose twice is the original (round-trip)', () => {
    const m = new Matrix4().loadIdentity().translate(1, 2, 3).rotateZ(22);
    expect(m.transpose().transpose().approxiEquals(m)).toBe(true);
  });

  it('transpose() does not mutate the source', () => {
    const m = new Matrix4().loadIdentity().translate(1, 2, 3).rotateZ(22);
    const original = m.clone();
    m.transpose();
    expect(m.approxiEquals(original)).toBe(true);
  });

  it('transposeInPlace() mutates and returns this', () => {
    const m = new Matrix4().loadIdentity().translate(1, 2, 3).rotateZ(22);
    const expected = m.transpose();
    const ret = m.transposeInPlace();
    expect(ret).toBe(m);
    expect(m.approxiEquals(expected)).toBe(true);
  });
});

describe('Matrix4 projections', () => {
  it('ortho produces the expected entries', () => {
    const m = new Matrix4().ortho(-2, 2, -3, 3, 1, 5);
    close(m.a1, 0.5);          // 2/(right-left)
    close(m.b2, 1 / 3);        // 2/(top-bottom)
    close(m.c3, -0.5);         // -2/(far-near)
    close(m.a4, 0);            // -(left+right)/x
    close(m.b4, 0);            // -(top+bottom)/y
    close(m.c4, -1.5);         // -(far+near)/z
    close(m.d4, 1);
  });

  it('perspective sets the homogeneous-divide row (d3=-1, d4=0)', () => {
    const m = new Matrix4().perspective(60, 16 / 9, 0.1, 1000);
    expect(m.d3).toBe(-1);
    expect(m.d4).toBe(0);
    expect(m.a1).toBeGreaterThan(0);
    expect(m.b2).toBeGreaterThan(0);
  });
});

describe('Matrix4 lookAt', () => {
  it('looking down -Z with +Y up yields an identity orientation', () => {
    const m = Matrix4.createLookAt(new Vec3(0, 0, 5), new Vec3(0, 0, 0), new Vec3(0, 1, 0));
    close(m.a1, 1); close(m.b2, 1); close(m.c3, 1); close(m.d4, 1);
  });

  it('the three basis rows are orthonormal', () => {
    const m = Matrix4.createLookAt(new Vec3(3, 4, 5), new Vec3(0, 0, 0), new Vec3(0, 1, 0));
    const x = new Vec3(m.a1, m.a2, m.a3);
    const y = new Vec3(m.b1, m.b2, m.b3);
    const z = new Vec3(m.c1, m.c2, m.c3);
    close(x.length(), 1); close(y.length(), 1); close(z.length(), 1);
    close(x.dot(y), 0); close(y.dot(z), 0); close(x.dot(z), 0);
  });
});

describe('Matrix4 extractEulerAngles (inverts single-axis rotations)', () => {
  it('rotateX(20) -> (20, 0, 0)', () => {
    closeVec(new Matrix4().loadIdentity().rotateX(20).extractEulerAngles(), [20, 0, 0], 4);
  });

  it('rotateY(30) -> (0, 30, 0)', () => {
    closeVec(new Matrix4().loadIdentity().rotateY(30).extractEulerAngles(), [0, 30, 0], 4);
  });

  it('rotateZ(15) -> (0, 0, 15)', () => {
    closeVec(new Matrix4().loadIdentity().rotateZ(15).extractEulerAngles(), [0, 0, 15], 4);
  });
});
