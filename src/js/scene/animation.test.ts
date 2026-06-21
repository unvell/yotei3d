import { describe, it, expect, beforeEach } from 'vitest';
import { Animation } from './animation';

const clearRegistry = () => {
  for (const k of Object.keys(Animation.RunningAnimations)) {
    delete Animation.RunningAnimations[k];
  }
};

describe('Animation registry helpers', () => {
  beforeEach(clearRegistry);

  it('isAnyAnimationPlaying reflects the registry (regression: _s3_isEmpty)', () => {
    expect(Animation.isAnyAnimationPlaying()).toBe(false);
    Animation.RunningAnimations['x'] = {} as any;
    expect(Animation.isAnyAnimationPlaying()).toBe(true);
  });

  it('isAnimationPlaying checks by name', () => {
    expect(Animation.isAnimationPlaying('a')).toBe(false);
    Animation.RunningAnimations['a'] = {} as any;
    expect(Animation.isAnimationPlaying('a')).toBe(true);
  });

  it('cancelAnimationByName removes a running animation', () => {
    Animation.RunningAnimations['a'] = {} as any;
    Animation.cancelAnimationByName('a');
    expect(Animation.isAnimationPlaying('a')).toBe(false);
  });

  it('getAvailableDefaultName never collides with an existing name (regression: random was always 0)', () => {
    const n1 = Animation.getAvailableDefaultName();
    expect(typeof n1).toBe('string');
    expect(Animation.RunningAnimations.hasOwnProperty(n1)).toBe(false);

    // Occupy n1, then ask again: the loop must return a different, fresh name.
    Animation.RunningAnimations[n1] = {} as any;
    const n2 = Animation.getAvailableDefaultName();
    expect(n2).not.toBe(n1);
    expect(Animation.RunningAnimations.hasOwnProperty(n2)).toBe(false);
  });
});

describe('Animation timing getters before initialize() (regression: NaN)', () => {
  it('progressRate is 0, not NaN, before play()', () => {
    const a = new (Animation as any)(null, { duration: 2 });
    expect(Number.isNaN(a.progressRate)).toBe(false);
    expect(a.progressRate).toBe(0);
  });

  it('isFinished is false before play()', () => {
    const a = new (Animation as any)(null, { duration: 2 });
    expect(a.isFinished).toBe(false);
  });
});
