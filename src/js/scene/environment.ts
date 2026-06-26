import { Color3 } from "@/math";

/**
 * The scene environment — the single source of ambient/indirect light
 * (see docs/RENDERING.md §2). A scene's `environment` is either:
 *
 *   - an image-based sky (SkyBox / HDRISkyBox / DynamicSky …): drawn as the
 *     background and baked into IBL (diffuse irradiance + prefiltered specular);
 *   - a `SimpleSky`: a constant-colour environment — the uniform-radiance
 *     (degenerate) IBL used when there is no image sky, so a scene is never
 *     pitch black just because it has no skybox.
 *
 * `scene.environment` defaults to a `SimpleSky`. Assigning an image sky (or the
 * legacy `scene.skybox = …`) switches the scene to real IBL.
 */
export class SimpleSky {
  // Marks this as the constant-colour environment (not image-based). The scene
  // uses this to decide between the ambient-colour fallback and baked IBL.
  readonly isImageBased = false;

  color: Color3;
  intensity: number;

  constructor(color: any = [0.5, 0.52, 0.58], intensity = 1.0) {
    this.color = (color instanceof Color3) ? color
      : new Color3(
        Array.isArray(color) ? color[0] : color.r,
        Array.isArray(color) ? color[1] : color.g,
        Array.isArray(color) ? color[2] : color.b);
    this.intensity = intensity;
  }

  // The constant indirect-diffuse irradiance the standard shader applies when
  // no probes / baked IBL are present: colour scaled by intensity.
  get ambientColor(): number[] {
    return [
      this.color.r * this.intensity,
      this.color.g * this.intensity,
      this.color.b * this.intensity,
    ];
  }
}
