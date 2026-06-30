import { Ocean } from '@';
import type { Scene, SceneObject } from '@';

/**
 * The sea. Wraps the engine's GPU Gerstner-wave Ocean with the calm, world-fixed
 * config from landing-p2 (big enough to reach the horizon). The wake / contact-
 * foam hooks from landing-p1 are exposed as methods so a moving carrier (or the
 * jet's own wake later) can be wired in without changing this class.
 */
export class OceanWorld {
  readonly object: Ocean;

  constructor(scene: Scene) {
    this.object = new Ocean({
      size: 100000,
      segments: 40,
      level: 0,
      wind: [1, 0.4],
      waveAmp: 0.02,
      waveLen: 100,
      waveSpeed: 0.05,
      steepness: 0.02,
      sunGlitter: 0.2,
      specStrength: 0.06,
      fresnelPower: 5,
      fresnelBias: 0.01,
      reflectivity: 0.4,
      reflectionBlur: 1.5,
      rippleScale: 0.5,
      rippleStrength: 0.3,
      rippleDetail: 1,
      deepColor: [0.016, 0.067, 0.125],
      shallowColor: [0.078, 0.157, 0.243],
    });
    this.object.location.set(0, 0, 0);
    scene.add(this.object);
  }

  /** Make the sea follow a moving subject (grid-snapped, so waves stay stable). */
  follow(target: SceneObject): void {
    this.object.options.followTarget = target;
  }

  /** Lay a foam wake behind a moving source (see landing-p1 for the tuning). */
  setWake(source: SceneObject): void {
    this.object.options.wake = {
      source,
      dropDistance: 20,
      life: 50,
      maxPoints: 48,
      width: 22,
      widthGrowth: 2,
      foamColor: [1.0, 1.05, 1.12],
      foamIntensity: 0.5,
      sparkle: 6,
    };
  }

  /** White contact foam where solids (hull) break the surface. */
  setContactFoam(): void {
    this.object.options.contactFoam = {
      enabled: true,
      distance: 2,
      color: [1.0, 1.05, 1.12],
      intensity: 0.3,
    };
  }

  update(): void {
    this.object.update();
  }
}
