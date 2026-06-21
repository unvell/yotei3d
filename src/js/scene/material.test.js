import { describe, it, expect } from 'vitest';
import { Color3 } from '@jingwood/graphics-math';
import { Material } from './material';

// Phase 0 smoke test: validates the toolchain (vitest + graphics-math + ESM)
// and pins the current Material data contract before the TS migration so the
// refactor is observably behaviour-preserving.
describe('Material (baseline contract)', () => {
  it('constructs with glTF metallic-roughness defaults', () => {
    const m = new Material();
    expect(m.color).toBeInstanceOf(Color3);
    expect([m.color.r, m.color.g, m.color.b]).toEqual([0.8, 0.8, 0.8]);
    expect(m.roughness).toBe(0.5);
    expect(m.metallic).toBe(0.0);
    expect(m.emissiveColor).toBeInstanceOf(Color3);
    expect([m.emissiveColor.r, m.emissiveColor.g, m.emissiveColor.b]).toEqual([0, 0, 0]);
  });

  it('copyFrom clones color by value (not by reference)', () => {
    const src = new Material();
    src.color = new Color3(0.1, 0.2, 0.3);
    const dst = new Material();
    dst.copyFrom(src);

    expect([dst.color.r, dst.color.g, dst.color.b]).toEqual([0.1, 0.2, 0.3]);
    src.color.r = 0.9;
    expect(dst.color.r).toBe(0.1); // independent copy
  });

  it('copyFrom carries scalar factors', () => {
    const src = new Material();
    src.roughness = 0.25;
    src.metallic = 0.75;
    const dst = new Material();
    dst.copyFrom(src);
    expect(dst.roughness).toBe(0.25);
    expect(dst.metallic).toBe(0.75);
  });

  it('clone produces an equivalent independent material', () => {
    const src = new Material();
    src.roughness = 0.33;
    const c = src.clone();
    expect(c).toBeInstanceOf(Material);
    expect(c.roughness).toBe(0.33);
    expect(c).not.toBe(src);
  });

  it('clone of a subclass returns the subclass type', () => {
    class FancyMaterial extends Material {
      get shaderName() { return 'fancy'; }
    }
    const c = new FancyMaterial().clone();
    expect(c).toBeInstanceOf(FancyMaterial);
    expect(c.shaderName).toBe('fancy');
  });
});

describe('Material (render-method contract)', () => {
  it('selects the standard shader by default', () => {
    expect(new Material().shaderName).toBe('standard');
  });

  it('casts shadow by default', () => {
    expect(new Material().castShadow).toBe(true);
  });

  it('lets a subclass override the shader selection', () => {
    class RainishMaterial extends Material {
      get shaderName() { return 'rain'; }
      constructor() {
        super();
        this.castShadow = false;
      }
    }
    const m = new RainishMaterial();
    expect(m.shaderName).toBe('rain');
    expect(m.castShadow).toBe(false);
    expect(m).toBeInstanceOf(Material);
  });
});
