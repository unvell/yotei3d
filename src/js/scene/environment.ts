import { Color3 } from "@/math";

function toColor3(c: any): Color3 {
  if (c instanceof Color3) return c;
  if (Array.isArray(c)) return new Color3(c[0], c[1], c[2]);
  return new Color3(c.r, c.g, c.b);
}

/**
 * The scene environment — the single source of ambient/indirect light AND the
 * background you see when looking past the geometry (see docs/RENDERING.md §2).
 * A scene's `environment` is either:
 *
 *   - an image-based sky (SkyBox / HDRSkyBox / DynamicSky): drawn as the cubemap
 *     background and baked into IBL (diffuse irradiance + prefiltered specular);
 *   - a `SimpleSky`: a constant-colour environment — a uniform-radiance
 *     (degenerate) IBL that lights the scene AND fills the background, optionally
 *     with a background image. Used when there is no image sky, so a scene is
 *     never pitch black / undefined just because it has no skybox.
 *
 * `scene.environment` defaults to a `SimpleSky`. It is the single property —
 * there is no separate `scene.skybox` / `renderer.backColor` / `backgroundImage`.
 */
export class SimpleSky {
  // Not an image sky — the scene uses this to choose between the ambient-colour
  // fallback + flat background and a baked cubemap.
  readonly isImageBased = false;

  // ambient (indirect-diffuse) irradiance + its scalar strength
  color: Color3;
  intensity: number;

  // background: a flat fill colour drawn behind the scene, and/or an image.
  // Separate from `color` so a scene can have e.g. a light backdrop with modest
  // ambient. Both are rendered through the scene's single tone-map/encode.
  background: Color3;
  backgroundImage: string | null;

  constructor(color: any = [0.5, 0.52, 0.58], options: any = {}) {
    this.color = toColor3(color);
    this.intensity = (typeof options.intensity === "number") ? options.intensity : 1.0;
    this.background = options.background ? toColor3(options.background) : new Color3(0.93, 0.93, 0.93);
    this.backgroundImage = options.backgroundImage || null;
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
