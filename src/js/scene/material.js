import { Color3 } from '@jingwood/graphics-math'
import { Texture } from '../webgl/texture.js'

// Material follows the glTF 2.0 metallic-roughness workflow.
//
// Scalar fields act as *factors* and are multiplied with their corresponding
// texture maps when a map is present (matching glTF's *Factor / *Texture pair):
//   color            <- baseColorFactor      tex                  <- baseColorTexture
//   metallic         <- metallicFactor       metallicRoughnessMap <- metallicRoughnessTexture (G=rough, B=metal)
//   roughness        <- roughnessFactor       aoMap                <- occlusionTexture (R)
//   emissiveColor    <- emissiveFactor        emissiveMap          <- emissiveTexture
//   normalmap        <- normalTexture
//
// A single combined ORM texture can be used by assigning the same Texture to
// both metallicRoughnessMap and aoMap (R=occlusion, G=roughness, B=metallic).
export class Material {
  constructor() {
    this.color = new Color3(0.8, 0.8, 0.8);   // baseColorFactor
    this.roughness = 0.5;                      // roughnessFactor
    this.metallic = 0.0;                       // metallicFactor
    this.emissiveColor = new Color3(0, 0, 0);  // emissiveFactor (black = no PBR emission)
  }

  copyFrom(mat) {
    // base color
    if (typeof mat.color === "object" && mat.color instanceof Color3) {
      this.color = mat.color.clone();
    } else if (Array.isArray(mat.color)) {
      this.color = mat.color.slice();
    }

    // base color (albedo) texture
    if (typeof mat.tex === "object" && mat.tex instanceof Texture) {
      this.tex = mat.tex;
    }

    // texture tiling
    if (typeof mat.texTiling === "object") {
      if (typeof mat.texTiling.clone === "function") {
        this.texTiling = mat.texTiling.clone();
      } else if (Array.isArray(mat.texTiling)) {
        this.texTiling = mat.texTiling.slice();
      }
    }

    // glossy (legacy non-IBL specular knob)
    if (typeof mat.glossy !== "undefined") {
      this.glossy = mat.glossy;
    }

    // roughness factor
    if (typeof mat.roughness !== "undefined") {
      this.roughness = mat.roughness;
    }

    // metallic factor
    if (typeof mat.metallic !== "undefined") {
      this.metallic = mat.metallic;
    }

    // emission (legacy light-source intensity)
    if (typeof mat.emission !== "undefined") {
      this.emission = mat.emission;
    }

    // emissive color (PBR self-illumination factor)
    if (typeof mat.emissiveColor === "object" && mat.emissiveColor instanceof Color3) {
      this.emissiveColor = mat.emissiveColor.clone();
    } else if (Array.isArray(mat.emissiveColor)) {
      this.emissiveColor = mat.emissiveColor.slice();
    }

    // transparency
    if (typeof mat.transparency !== "undefined") {
      this.transparency = mat.transparency;
    }

    // refraction
    if (typeof mat.refraction !== "undefined") {
      this.refraction = mat.refraction;
    }

    // spot range
    if (typeof mat.spotRange !== "undefined") {
      this.spotRange = mat.spotRange;
    }

    // normal map
    if (typeof mat.normalmap === "object" && mat.normalmap instanceof Texture) {
      this.normalmap = mat.normalmap;
    }

    // normal mipmap
    if (typeof mat.normalMipmap !== "undefined") {
      this.normalMipmap = mat.normalMipmap;
    }

    // normal intensity
    if (typeof mat.normalIntensity !== "undefined") {
      this.normalIntensity = mat.normalIntensity;
    }

    // metallic-roughness map (glTF: G=roughness, B=metallic)
    if (typeof mat.metallicRoughnessMap === "object" && mat.metallicRoughnessMap instanceof Texture) {
      this.metallicRoughnessMap = mat.metallicRoughnessMap;
    }

    // ambient-occlusion map (R channel)
    if (typeof mat.aoMap === "object" && mat.aoMap instanceof Texture) {
      this.aoMap = mat.aoMap;
    }

    // emissive map
    if (typeof mat.emissiveMap === "object" && mat.emissiveMap instanceof Texture) {
      this.emissiveMap = mat.emissiveMap;
    }
  }

  clone() {
    const clone = new Material();
    clone.copyFrom(this);
    return clone;
  }
}
