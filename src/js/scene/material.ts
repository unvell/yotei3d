import { Color3, Vec2, Vec3, Vec4 } from '@jingwood/graphics-math';
import { Texture } from '../webgl/texture.js';

// Material follows the glTF 2.0 metallic-roughness workflow.
//
// Scalar fields act as *factors* and are multiplied with their corresponding
// texture maps when a map is present (matching glTF's *Factor / *Texture pair):
//   color            <- baseColorFactor      tex                  <- baseColorTexture
//   metallic         <- metallicFactor       metallicRoughnessMap <- metallicRoughnessTexture (G=rough, B=metal)
//   roughness        <- roughnessFactor      aoMap                <- occlusionTexture (R)
//   emissiveColor    <- emissiveFactor       emissiveMap          <- emissiveTexture
//   normalmap        <- normalTexture
//
// A single combined ORM texture can be used by assigning the same Texture to
// both metallicRoughnessMap and aoMap (R=occlusion, G=roughness, B=metallic).
//
// Architectural note (TS migration): the Material — not the SceneObject — owns
// the choice of *which* shader renders it. `shaderName` is the seed of that
// contract; subclasses (StandardMaterial, RainMaterial, ...) override it. The
// renderer resolves `shaderName` to a shared Shader program. `castShadow` /
// `depthShaderName` are likewise material-owned but only consumed once the
// renderer's drawObject path is unified (a later phase) — they are dormant
// groundwork here, not yet read by the runtime.
export class Material {
  /** glTF baseColorFactor. */
  color: Color3 | number[] = new Color3(0.8, 0.8, 0.8);
  /** glTF roughnessFactor. */
  roughness = 0.5;
  /** glTF metallicFactor. */
  metallic = 0.0;
  /** glTF emissiveFactor (black = no PBR emission). */
  emissiveColor: Color3 | number[] = new Color3(0, 0, 0);

  // --- optional texture maps (assigned lazily during loading) ---
  tex?: Texture;
  normalmap?: Texture;
  metallicRoughnessMap?: Texture;
  aoMap?: Texture;
  emissiveMap?: Texture;

  // --- optional scalar / vector knobs ---
  texTiling?: Vec2 | Vec3 | Vec4 | number[];
  glossy?: number;
  /** Legacy light-source intensity (drives Scene light tracking). */
  emission?: number;
  transparency?: number;
  refraction?: number;
  spotRange?: number;
  normalMipmap?: number;
  normalIntensity?: number;

  // --- render-method contract (consumed by the renderer in a later phase) ---
  /** Which shader program renders this material. Subclasses override. */
  get shaderName(): string {
    return 'standard';
  }
  /** Whether objects with this material write into the shadow map. */
  castShadow = true;
  /** Optional dedicated shader for the depth/shadow pass. */
  depthShaderName?: string;

  copyFrom(mat: any): void {
    // base color
    if (typeof mat.color === 'object' && mat.color instanceof Color3) {
      this.color = mat.color.clone();
    } else if (Array.isArray(mat.color)) {
      this.color = mat.color.slice();
    }

    // base color (albedo) texture
    if (typeof mat.tex === 'object' && mat.tex instanceof Texture) {
      this.tex = mat.tex;
    }

    // texture tiling
    if (typeof mat.texTiling === 'object' && mat.texTiling !== null) {
      if (typeof mat.texTiling.clone === 'function') {
        this.texTiling = mat.texTiling.clone();
      } else if (Array.isArray(mat.texTiling)) {
        this.texTiling = mat.texTiling.slice();
      }
    }

    // glossy (legacy non-IBL specular knob)
    if (typeof mat.glossy !== 'undefined') {
      this.glossy = mat.glossy;
    }

    // roughness factor
    if (typeof mat.roughness !== 'undefined') {
      this.roughness = mat.roughness;
    }

    // metallic factor
    if (typeof mat.metallic !== 'undefined') {
      this.metallic = mat.metallic;
    }

    // emission (legacy light-source intensity)
    if (typeof mat.emission !== 'undefined') {
      this.emission = mat.emission;
    }

    // emissive color (PBR self-illumination factor)
    if (typeof mat.emissiveColor === 'object' && mat.emissiveColor instanceof Color3) {
      this.emissiveColor = mat.emissiveColor.clone();
    } else if (Array.isArray(mat.emissiveColor)) {
      this.emissiveColor = mat.emissiveColor.slice();
    }

    // transparency
    if (typeof mat.transparency !== 'undefined') {
      this.transparency = mat.transparency;
    }

    // refraction
    if (typeof mat.refraction !== 'undefined') {
      this.refraction = mat.refraction;
    }

    // spot range
    if (typeof mat.spotRange !== 'undefined') {
      this.spotRange = mat.spotRange;
    }

    // normal map
    if (typeof mat.normalmap === 'object' && mat.normalmap instanceof Texture) {
      this.normalmap = mat.normalmap;
    }

    // normal mipmap
    if (typeof mat.normalMipmap !== 'undefined') {
      this.normalMipmap = mat.normalMipmap;
    }

    // normal intensity
    if (typeof mat.normalIntensity !== 'undefined') {
      this.normalIntensity = mat.normalIntensity;
    }

    // metallic-roughness map (glTF: G=roughness, B=metallic)
    if (typeof mat.metallicRoughnessMap === 'object' && mat.metallicRoughnessMap instanceof Texture) {
      this.metallicRoughnessMap = mat.metallicRoughnessMap;
    }

    // ambient-occlusion map (R channel)
    if (typeof mat.aoMap === 'object' && mat.aoMap instanceof Texture) {
      this.aoMap = mat.aoMap;
    }

    // emissive map
    if (typeof mat.emissiveMap === 'object' && mat.emissiveMap instanceof Texture) {
      this.emissiveMap = mat.emissiveMap;
    }
  }

  clone(): this {
    // Use the actual constructor so subclasses clone to their own type.
    const clone = new (this.constructor as new () => this)();
    clone.copyFrom(this);
    return clone;
  }
}
