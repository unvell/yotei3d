import { HDRSkyBox, LensFlare } from '@';
import type { Renderer, Scene } from '@';

const HDRI_URL = '/textures/hdr/kloppenheim_06_puresky_4k.hdr';

/**
 * Sky + atmosphere + key light, lifted from landing-p1/p2:
 *   • clear-blue HDRI environment (backdrop + image-based lighting),
 *   • fog + skyFog so the sea fades into the horizon with no hard seam,
 *   • a warm directional sun, and
 *   • a LensFlare bound to the sun (added once the carrier exists, so the hull
 *     can occlude it).
 */
export class Environment {
  lensFlare: LensFlare | null = null;

  constructor(
    private readonly renderer: Renderer,
    private readonly scene: Scene,
  ) {}

  setup(): void {
    const scene = this.scene;

    scene.environment = new HDRSkyBox(this.renderer, HDRI_URL, {
      faceSize: 1024,
      rotation: 180,
    });
    scene.environment.mat = { color: [0.4, 0.4, 0.4] };
    scene.environment.intensity = 1.0;
    scene.mainCamera.exposure = 0.5;

    // haze the sea into the horizon and bleed the same haze into the bottom of
    // the sky so they meet at one colour instead of a hard line.
    scene.fog = { near: 600, far: 6000, color: [0.16, 0.26, 0.36] };
    scene.skyFog = { color: [0.3, 0.4, 0.48], lower: 0.0, upper: 0.02, density: 0.5 };

    // warm daylight key, low-ish so the deck and island catch a clear highlight.
    scene.sun.direction = [1.7, 0.2, -1.4];
    scene.sun.mat.color = [1.3, 1.18, 0.95];
  }

  /** Add the sun lens flare. Call once the occluders (carrier) exist. */
  addSunFlare(occluders: any[]): void {
    this.lensFlare = new LensFlare(this.scene, {
      follow: this.scene.sun,
      occluders,
      color: [1, 1, 0.95],
      intensity: 1,
      coreIntensity: 0.1,
      scale: 2.0,
    });
  }
}
