import { describe, it, expect } from 'vitest';
import { Color3 } from './color3.js';
import { Color4 } from './color4.js';

const close = (a, b, p = 6) => expect(a).toBeCloseTo(b, p);

describe('Color3 construction', () => {
  it('defaults to black', () => {
    expect(new Color3().toArray()).toEqual([0, 0, 0]);
  });

  it('a single number fills all channels (grayscale)', () => {
    expect(new Color3(0.5).toArray()).toEqual([0.5, 0.5, 0.5]);
  });

  it('takes (r, g, b)', () => {
    expect(new Color3(0.1, 0.2, 0.3).toArray()).toEqual([0.1, 0.2, 0.3]);
  });

  it('copies from another color', () => {
    expect(new Color3(new Color3(0.4, 0.5, 0.6)).toArray()).toEqual([0.4, 0.5, 0.6]);
  });

  it('clone is independent', () => {
    const a = new Color3(0.1, 0.2, 0.3);
    const b = a.clone();
    b.r = 1;
    expect(a.r).toBe(0.1);
  });

  it('fromArray', () => {
    expect(Color3.fromArray([0.1, 0.2, 0.3]).toArray()).toEqual([0.1, 0.2, 0.3]);
  });
});

describe('Color3 arithmetic', () => {
  it('add / sub', () => {
    const sum = new Color3(0.1, 0.2, 0.3).add(new Color3(0.1, 0.1, 0.1));
    close(sum.r, 0.2); close(sum.g, 0.3); close(sum.b, 0.4);
    const diff = new Color3(0.5, 0.5, 0.5).sub(new Color3(0.1, 0.2, 0.3));
    close(diff.r, 0.4); close(diff.g, 0.3); close(diff.b, 0.2);
  });

  it('mul scales each channel', () => {
    const c = new Color3(0.1, 0.2, 0.3).mul(2);
    close(c.r, 0.2); close(c.g, 0.4); close(c.b, 0.6);
  });

  it('lerp blends two colors', () => {
    const c = new Color3(0, 0, 0).lerp(new Color3(1, 1, 1), 0.5);
    close(c.r, 0.5); close(c.g, 0.5); close(c.b, 0.5);
  });
});

describe('Color3.length / normalize (treats rgb as a vector)', () => {
  it('length uses the r/g/b channels', () => {
    expect(new Color3(0, 3, 4).length()).toBe(5);
  });

  it('normalize yields unit length', () => {
    const n = new Color3(0, 3, 4).normalize();
    close(n.length(), 1);
  });
});

describe('Color3 named constants', () => {
  it('white / black / red / green / blue', () => {
    expect(Color3.white.toArray()).toEqual([1, 1, 1]);
    expect(Color3.black.toArray()).toEqual([0, 0, 0]);
    expect(Color3.red.toArray()).toEqual([1, 0, 0]);
    expect(Color3.green.toArray()).toEqual([0, 1, 0]);
    expect(Color3.blue.toArray()).toEqual([0, 0, 1]);
  });
});

describe('Color4 construction', () => {
  it('defaults to transparent black', () => {
    expect(new Color4().toArray()).toEqual([0, 0, 0, 0]);
  });

  it('a single number fills all four channels', () => {
    expect(new Color4(0.5).toArray()).toEqual([0.5, 0.5, 0.5, 0.5]);
  });

  it('three components default alpha to 1', () => {
    expect(new Color4(0.1, 0.2, 0.3).toArray()).toEqual([0.1, 0.2, 0.3, 1]);
  });

  it('takes (r, g, b, a)', () => {
    expect(new Color4(0.1, 0.2, 0.3, 0.4).toArray()).toEqual([0.1, 0.2, 0.3, 0.4]);
  });

  it('from a Color3 plus explicit alpha', () => {
    expect(new Color4(new Color3(0.1, 0.2, 0.3), 0.7).toArray()).toEqual([0.1, 0.2, 0.3, 0.7]);
  });

  it('copies from another Color4', () => {
    expect(new Color4(new Color4(0.1, 0.2, 0.3, 0.4)).toArray()).toEqual([0.1, 0.2, 0.3, 0.4]);
  });

  it('rgb() drops the alpha channel', () => {
    const rgb = new Color4(0.1, 0.2, 0.3, 0.4).rgb();
    expect(rgb).toBeInstanceOf(Color3);
    expect(rgb.toArray()).toEqual([0.1, 0.2, 0.3]);
  });
});

describe('Color4 named constants', () => {
  it('white is opaque white', () => {
    expect(Color4.white.toArray()).toEqual([1, 1, 1, 1]);
  });

  it('black is opaque black', () => {
    expect(Color4.black.toArray()).toEqual([0, 0, 0, 1]);
  });
});

describe('Color4 arithmetic', () => {
  it('lerp blends including alpha', () => {
    const c = new Color4(0, 0, 0, 0).lerp(new Color4(1, 1, 1, 1), 0.25);
    close(c.r, 0.25); close(c.a, 0.25);
  });
});
