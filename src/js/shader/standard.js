
import { Vec2, Vec3, Color3, Color4, Matrix4 } from "@jingwood/graphics-math";
import { BoundingBox3D, MathFunctions } from "@jingwood/graphics-math";

import { Shader } from "../webgl/shader"
import { Texture  } from "../webgl/texture.js";
import { CubeMap } from '../webgl/cubemap.js';
import { ShaderSources } from './shadersources.js'

export class StandardShader extends Shader {
	constructor(renderer, vertShaderSrc, fragShaderSrc) {
		super(renderer, vertShaderSrc, fragShaderSrc);

		this.use();

		this.vertexPositionAttribute = this.findAttribute("vertexPosition");
		this.vertexNormalAttribute = this.findAttribute("vertexNormal");
		this.vertexTexcoordAttribute = this.findAttribute("vertexTexcoord");
		this.vertexTexcoord2Attribute = this.findAttribute("vertexTexcoord2");
		this.vertexTangentAttribute = this.findAttribute("vertexTangent");
		this.vertexBitangentAttribute = this.findAttribute("vertexBitangent");
		this.vertexColorAttribute = this.findAttribute("vertexColor");
    
		this.projectViewMatrixUniform = this.bindUniform("projectViewMatrix", "mat4");
		this.modelMatrixUniform = this.bindUniform("modelMatrix", "mat4");
		this.modelMatrix3x3Uniform = this.bindUniform("modelMatrix3x3", "mat3");
		this.normalMatrixUniform = this.bindUniform("normalMatrix", "mat4");
		this.shadowMapProjectionMatrixUniform = this.bindUniform("shadowmapProjectionMatrix", "mat4");

    // skin
    this.vertexJointAttribute = this.findAttribute("a_joint");
    this.vertexWeightAttribute = this.findAttribute("a_weight");
		this.jointMatrixUniforms = this.bindUniformArray("u_jointMat", "mat4", 100);

		this.sundirUniform = this.bindUniform("sundir", "vec3");
		this.sunlightUniform = this.bindUniform("sunlight", "color3");
	
		this.receiveLightUniform = this.bindUniform("receiveLight", "bool");
		this.receiveShadowUniform = this.bindUniform("receiveShadow", "bool");
		this.opacityUniform = this.bindUniform("opacity", "float");
		this.colorUniform = this.bindUniform("color", "color3");
		this.texTilingUniform = this.bindUniform("texTiling", "vec2");
		this.glossyUniform = this.bindUniform("glossy", "float");
		this.roughnessUniform = this.bindUniform("roughness", "float");
		this.metallicUniform = this.bindUniform("metallic", "float");
		this.emissionUniform = this.bindUniform("emission", "float");
		this.refractionUniform = this.bindUniform("refraction", "float");
		this.normalMipmapUniform = this.bindUniform("normalMipmap", "float");
		this.normalIntensityUniform = this.bindUniform("normalIntensity", "float");
		this.shadowIntensityUniform = this.bindUniform("shadowIntensity", "float");
		
		this.refmapBoxUniform = this.bindUniform("refMapBox", "bbox");

		this.textureUniform = this.bindUniform("texture", "tex", 0);
		this.normalMapUniform = this.bindUniform("normalMap", "tex", 1);
		this.lightMapUniform = this.bindUniform("lightMap", "tex", 2);
		this.refMapUniform = this.bindUniform("refMap", "texcube", 4);
		this.irradianceMapUniform = this.bindUniform("irradianceMap", "texcube", 6);

		// PBR material maps (glTF metallic-roughness workflow)
		this.metalRoughMapUniform = this.bindUniform("metalRoughMap", "tex", 7);
		this.aoMapUniform = this.bindUniform("aoMap", "tex", 8);
		this.emissiveMapUniform = this.bindUniform("emissiveMap", "tex", 9);
		this.hasMetalRoughMapUniform = this.bindUniform("hasMetalRoughMap", "bool");
		this.hasAOMapUniform = this.bindUniform("hasAOMap", "bool");
		this.hasEmissiveMapUniform = this.bindUniform("hasEmissiveMap", "bool");
		this.emissiveColorUniform = this.bindUniform("emissiveColor", "color3");

		// image-based lighting (IBL)
		this.hasIBLUniform = this.bindUniform("hasIBL", "bool");
		this.useDirectSunUniform = this.bindUniform("useDirectSun", "bool");
		this.iblIntensityUniform = this.bindUniform("iblIntensity", "float");
		this.maxEnvLodUniform = this.bindUniform("maxEnvLod", "float");
		this.exposureUniform = this.bindUniform("exposure", "float");
		this.iblColorUniform = this.bindUniform("iblColor", "color3");

		// light-probe irradiance volume (SH L1)
		this.hasProbesUniform = this.bindUniform("hasProbes", "bool");
		this.probeCountUniform = this.bindUniform("probeCount", "int");
		this.probeCellUniform = this.bindUniform("probeCell", "vec3");
		this.probeIntensityUniform = this.bindUniform("probeIntensity", "float");
		this.probePosUniform = this.bindUniformArray("probePos", "vec3", 32);
		this.probeSHUniform = this.bindUniformArray("probeSH", "vec3", 32 * 9);

		// this.hasTextureUniform = this.bindUniform("hasTexture", "bool");
		// this.hasLightMapUniform = this.bindUniform("hasLightMap", "bool");
		this.refMapTypeUniform = this.bindUniform("refMapType", "int");
		this.shadowMapTypeUniform = this.bindUniform("shadowMapType", "int");
		this.hasNormalMapUniform = this.bindUniform("hasNormalMap", "bool");
		// this.hasUV2Uniform = this.bindUniform("hasUV2", "bool");

		this.cameraLocUniform = this.bindUniform("cameraLoc", "vec3");

		// light source
		this.lightSources = [];
		this.lightUniforms = [];
		this.normalMatrix = new Matrix4();

		for (var i = 0; i < 50; i++) {
			var indexName = "lights[" + i + "].";
			const lightUniform = {
				type: this.findUniform(indexName + "type"),
				pos: this.bindUniform(indexName + "pos", "vec3"),
				color: this.bindUniform(indexName + "color", "color3"),
			};
			if (!lightUniform.pos.address) break;
			this.lightUniforms.push(lightUniform);
		}
	
		this.lightCountUniform = this.bindUniform("lightCount", "int");

		// shadow
		this.shadowMapUniform = {
			boundingBox: this.bindUniform("shadowMapBox", "bbox"),
			tex2d: this.bindUniform("shadowMap2D", "tex", 3),
			texcube: this.bindUniform("shadowMap", "texcube", 5),
		};
		
		// empty cubemap
		this.emptyCubemap = new CubeMap(renderer);
		this.emptyCubemap.enableMipmap = false;
		this.emptyCubemap.createEmpty();

		this.emptyBoundingBox = new BoundingBox3D();
		this.defaultIBLColor = [1.0, 1.0, 1.0];
		this.defaultEmissive = [0, 0, 0];
	}

	// A texture is ready to bind once it has finished loading and its backing
	// image is fully decoded.
	static isTextureReady(tex) {
		return tex && typeof tex === "object" && tex instanceof Texture
			&& !tex.isLoading && tex.image && tex.image.complete;
	}

	beginScene(scene) {
		super.beginScene(scene);
	
		this.projectViewMatrixUniform.set(this.renderer.projectionViewMatrixArray);

		// camera
		const camera = scene.mainCamera;
		let cameraLocation;

		if (camera) {
			cameraLocation = camera.worldLocation;
		} else {
			cameraLocation = Vec3.zero;
		}

		this.cameraLocUniform.set(cameraLocation);

		// lights
		let lightCount = 0;

		if (scene.renderer.options.enableLighting) {

			lightCount = scene._activedLightSources.length;
		
			if (this.renderer.options.debugMode) {
				this.renderer.debugger.currentLightCount = lightCount;
			}

			for (var i = 0; i < lightCount; i++) {
				const lightUniform = this.lightUniforms[i];
				var lightWrap = scene._activedLightSources[i];
				var light = lightWrap.object;

				lightUniform.pos.set(lightWrap.worldloc);
			
				if (light.mat) {
					const emission = light.mat.emission;

					if (light.mat.color) {
						if (Array.isArray(light.mat.color)) {
							var colorArr = light.mat.color;
							lightUniform.color.set([colorArr[0] * emission, colorArr[1] * emission, colorArr[2] * emission]);
						} else if (light.mat.color instanceof Color3) {
							lightUniform.color.set(light.mat.color.mul(emission));
						}
					} else {
						lightUniform.color.set([emission, emission, emission]);
					}
				}
			}


		}
	
		this.lightCountUniform.set(lightCount);

		// sun
		if (scene.sun !== undefined) {
			const sun = scene.sun;

			const sundir = Vec3.normalize(sun.worldLocation);
			this.sundirUniform.set(sundir);
		
			let sunlight = Shader.defaultSunColor;

			if (sun.mat && sun.mat.color) {
				sunlight = sun.mat.color;
			}

			this.sunlightUniform.set(sunlight);
		}
	
		// shadow

		if (this.renderer.options.enableShadow
			&& this._shadowMap2D && this._shadowMap2D instanceof Texture) {
			this.shadowMapTypeUniform.set(1);
			this.shadowMapUniform.tex2d.set(this._shadowMap2D);
			this.shadowMapUniform.texcube.set(this.emptyCubemap);
			this.shadowIntensityUniform.set(this.renderer.options.shadowQuality.intensity || 0.2);
		} else {
			this.shadowMapUniform.tex2d.set(Shader.emptyTexture);
			
			if (scene.shadowMap) {
				this.shadowMapTypeUniform.set(2);
	
				if (typeof scene.shadowMap.texture === "object"
					&& scene.shadowMap.texture instanceof CubeMap) {
	
					this.shadowMapUniform.texcube.set(scene.shadowMap);
				}
	
				this.shadowMapUniform.boundingBox.set(scene.shadowMap.bbox);
			} else {
				this.shadowMapUniform.texcube.set(this.emptyCubemap);
				this.shadowMapTypeUniform.set(0);
			}
		}

		// IBL: runtime-baked irradiance (diffuse) + environment cubemap (specular)
		const iblActive = this.renderer.options.enableEnvmap
			&& scene._iblIrradianceMap instanceof CubeMap && scene._iblIrradianceMap.loaded
			&& scene._iblEnvMap instanceof CubeMap && scene._iblEnvMap.loaded;

		this._iblActive = iblActive;
		this._sceneEnvMap = iblActive ? scene._iblEnvMap : null;

		if (iblActive) {
			this.hasIBLUniform.set(true);
			this.useDirectSunUniform.set(this.renderer.options.enableLighting !== false);
			this.irradianceMapUniform.set(scene._iblIrradianceMap);
			this.iblIntensityUniform.set(typeof scene.iblIntensity === "number" ? scene.iblIntensity : 1.0);
			this.maxEnvLodUniform.set(typeof scene._iblMaxLod === "number" ? scene._iblMaxLod : 6.0);
			this.exposureUniform.set(typeof scene.exposure === "number" ? scene.exposure : 1.0);
			this.iblColorUniform.set(scene.iblColor || this.defaultIBLColor);
		} else {
			this.hasIBLUniform.set(false);
			this.irradianceMapUniform.set(this.emptyCubemap);
		}

		// light probes / probe baking
		if (this.renderer._probeBaking) {
			// Capturing first-bounce radiance: render direct lighting only so the
			// probes don't feed indirect light back into themselves.
			this.hasIBLUniform.set(false);
			this.irradianceMapUniform.set(this.emptyCubemap);
			this.shadowMapTypeUniform.set(0);
			this.hasProbesUniform.set(false);
		} else if (this.renderer.options.enableLightProbes
			&& scene._probeData && scene._probeData.count > 0) {

			const pd = scene._probeData;
			this.hasProbesUniform.set(true);
			this.probeCountUniform.set(pd.count);
			this.probeCellUniform.set(pd.cell);
			this.probeIntensityUniform.set(typeof scene.probeIntensity === "number" ? scene.probeIntensity : 1.0);

			for (let i = 0; i < pd.count; i++) {
				this.probePosUniform[i].set([pd.positions[i * 3], pd.positions[i * 3 + 1], pd.positions[i * 3 + 2]]);
			}
			for (let i = 0; i < pd.count * 9; i++) {
				this.probeSHUniform[i].set([pd.coeffs[i * 3], pd.coeffs[i * 3 + 1], pd.coeffs[i * 3 + 2]]);
			}
		} else {
			this.hasProbesUniform.set(false);
		}
	}

	beginObject(obj) {
		super.beginObject(obj);

		var gl = this.gl;

		const modelMatrix = obj._transform;

		this.modelMatrixUniform.set(obj._transform);
		this.normalMatrixUniform.set(obj._normalTransform);
	
		this.receiveLightUniform.set((typeof obj.receiveLight === "boolean") ? obj.receiveLight : true);
		this.receiveShadowUniform.set((typeof obj.receiveShadow === "boolean") ? obj.receiveShadow : true);

		// material
		const mat = obj.mat;

		let normalMipmap = 0;
		let normalIntensity = 1.0;

		this.usingLightmap = null;
		this.useNormalmap = null;
	
		this.textureUniform.set(Shader.emptyTexture);

		let color = this.defaultColor;
		let metallic = 0;

		// PBR material maps (resolved below, applied after the mat block)
		let metalRoughMap = null;
		let aoMap = null;
		let emissiveMap = null;
		let emissiveColor = this.defaultEmissive;

		if (mat) {
			// texture
			if (mat.tex && typeof mat.tex === "object" && mat.tex instanceof Texture
				&& !mat.tex.isLoading && mat.tex.image && mat.tex.image.complete) {
				this.textureUniform.set(mat.tex);
				// this.hasTextureUniform.set(true);
			}
			
			// normal-map
			if (typeof mat.normalmap === "object" && mat.normalmap instanceof Texture
				&& !mat.normalmap.isLoading && mat.normalmap.image && mat.normalmap.image.complete) {
				this.useNormalmap = mat.normalmap;

				if (typeof mat.normalMipmap !== "undefined") {
					normalMipmap = -MathFunctions.clamp(mat.normalMipmap, 0, 5) * 5;
				}
			
				if (typeof mat.normalIntensity !== "undefined") {
					normalIntensity = mat.normalIntensity;
				}
			}

			if (mat.color) {
				color = mat.color;
			}

			// texture tiling
			if (mat.texTiling) {
				this.texTilingUniform.set(mat.texTiling);
			} else {
				this.texTilingUniform.set(this.defaultTexTiling);
			}
	
			// emission
			if (mat.emission) {
				this.emissionUniform.set(mat.emission);
			} else {
				this.emissionUniform.set(0);
			}
			
			// roughness
			if (!isNaN(mat.roughness)) {
				this.roughnessUniform.set(mat.roughness);
			} else {
				this.roughnessUniform.set(0.5);
			}

			// metallic
			if (!isNaN(mat.metallic)) {
				metallic = mat.metallic;
			}

			// glossy
			if (mat.glossy) {
				this.glossyUniform.set(mat.glossy);
			} else {
				this.glossyUniform.set(0);
			}
			
			// refraction
			if (mat.refraction) {
				this.refractionUniform.set(mat.refraction);
			} else {
				this.refractionUniform.set(0);
			}

			// metallic-roughness map (G=roughness, B=metallic)
			if (StandardShader.isTextureReady(mat.metallicRoughnessMap)) {
				metalRoughMap = mat.metallicRoughnessMap;
			}

			// ambient-occlusion map (R)
			if (StandardShader.isTextureReady(mat.aoMap)) {
				aoMap = mat.aoMap;
			}

			// emissive
			if (mat.emissiveColor) {
				emissiveColor = mat.emissiveColor;
			}
			if (StandardShader.isTextureReady(mat.emissiveMap)) {
				emissiveMap = mat.emissiveMap;
			}
		}

		this.colorUniform.set(color);
		this.metallicUniform.set(metallic);
		this.emissiveColorUniform.set(emissiveColor);

		// metallic-roughness map
		if (metalRoughMap) {
			this.metalRoughMapUniform.set(metalRoughMap);
			this.hasMetalRoughMapUniform.set(true);
		} else {
			this.metalRoughMapUniform.set(Shader.emptyTexture);
			this.hasMetalRoughMapUniform.set(false);
		}

		// ambient-occlusion map
		if (aoMap) {
			this.aoMapUniform.set(aoMap);
			this.hasAOMapUniform.set(true);
		} else {
			this.aoMapUniform.set(Shader.emptyTexture);
			this.hasAOMapUniform.set(false);
		}

		// emissive map
		if (emissiveMap) {
			this.emissiveMapUniform.set(emissiveMap);
			this.hasEmissiveMapUniform.set(true);
		} else {
			this.emissiveMapUniform.set(Shader.emptyTexture);
			this.hasEmissiveMapUniform.set(false);
		}

		// normal-map
		if (this.renderer.options.enableNormalMap && this.useNormalmap) {
			this.normalMapUniform.set(this.useNormalmap);
			this.modelMatrix3x3Uniform.set(modelMatrix);
			this.hasNormalMapUniform.set(true);
			this.normalMipmapUniform.set(normalMipmap);
			this.normalIntensityUniform.set(normalIntensity);
		} else {
			this.normalMapUniform.set(Shader.emptyTexture);
			this.hasNormalMapUniform.set(false);
		}

		// lightmap
		if (this.renderer.options.enableLightmap
			&& obj.lightmap && (obj.lightmap instanceof Texture)
			&& !obj.lightmap.isLoading) {
			this.lightMapUniform.set(obj.lightmap);
		} else {
			this.lightMapUniform.set(Shader.emptyTexture);
		}

		// refmap
		if (this.renderer.options.enableEnvmap
			&& typeof obj.refmap && (obj.refmap instanceof CubeMap) && obj.refmap.loaded) {
			this.refMapUniform.set(obj.refmap);
			this.refMapTypeUniform.set(1);

			if (!obj.refmap.bbox) {
				this.refmapBoxUniform.set(this.emptyBoundingBox);
			} else {
				this.refmapBoxUniform.set(obj.refmap.bbox);
				this.refMapTypeUniform.set(2);
			}
		} else if (this._iblActive) {
			// fall back to the scene environment cubemap for specular IBL
			this.refMapUniform.set(this._sceneEnvMap);
			this.refmapBoxUniform.set(this.emptyBoundingBox);
			this.refMapTypeUniform.set(1);
		} else {
			this.refMapUniform.set(this.emptyCubemap);
			this.refMapTypeUniform.set(0);
		}

		// opacity
		if (obj.__opacity < 1) {
      gl.enable(gl.BLEND);
			this.opacityUniform.set(obj.__opacity);
		} else {
			this.opacityUniform.set(1);
		}

		// shadow
		if (this.renderer.options.enableShadow && this._shadowMap2D) {
			const shadowMapShader = ShaderSources.shadowmap.instance;
			if (shadowMapShader) {
				const m = modelMatrix.mul(shadowMapShader.lightMatrix).mul(shadowMapShader.projectionMatrix);
				this.shadowMapProjectionMatrixUniform.set(m);
			}
    }
    
    // skin
    this.maxJointCount = 2;

    if (obj.skin) {
      if (this.maxJointCount < obj.skin.joints.length) {
        this.maxJointCount = obj.skin.joints.length;
      }

      obj._calculatedJointMatrixCache = new Array(this.maxJointCount);

      if (obj.skin.inverseMatrices.length > 0) {
        for (let i = 0; i < this.maxJointCount; i++) {
          const mat = obj.skin.inverseMatrices[i].mul(obj.skin.joints[i].jointMatrix);
          this.jointMatrixUniforms[i].set(mat);
          obj._calculatedJointMatrixCache[i] = mat;
        }
      } else {
        for (let i = 0; i < this.maxJointCount; i++) {
          this.jointMatrixUniforms[i].set(obj.skin.joints[i].jointMatrix);
          obj._calculatedJointMatrixCache[i] = obj.skin.joints[i].jointMatrix;
        }
      }
      
    } else {
      for (let i = 0; i < this.maxJointCount; i++) {
        this.jointMatrixUniforms[i].set(Matrix4.IdentityArray);
      }
    }
	}

	beginMesh(mesh) {
		super.beginMesh(mesh);
	
    const gl = this.gl;
    
    // skin
    if (this.vertexJointAttribute >= 0) {
      if (mesh.jointBuffer) {
        gl.bindBuffer(gl.ARRAY_BUFFER, mesh.meta.skinJointBufferId);
        gl.vertexAttribPointer(this.vertexJointAttribute, 4, gl.UNSIGNED_SHORT, false, mesh.meta.jointStride, 0);
        gl.enableVertexAttribArray(this.vertexJointAttribute);
      } else {
        gl.disableVertexAttribArray(this.vertexJointAttribute);
      }
    }
    if (this.vertexWeightAttribute >= 0) {
      if (mesh.jointWeightsBuffer) {
        gl.bindBuffer(gl.ARRAY_BUFFER, mesh.meta.skinJointWeightsBufferId);
        gl.vertexAttribPointer(this.vertexWeightAttribute, 4, gl.FLOAT, false, 0, 0);
        gl.enableVertexAttribArray(this.vertexWeightAttribute);
      } else {
        gl.disableVertexAttribArray(this.vertexWeightAttribute);
      }
    }

		// lightmap
		if (this.usingLightmap === null) {
			gl.activeTexture(gl.TEXTURE2);
			if (this.renderer.options.enableLightmap
				&& typeof mesh._lightmap === "object" && mesh._lightmap instanceof Texture
				&& !mesh._lightmap.isLoading) {
				this.usingLightmap = mesh._lightmap;
				this.usingLightmap.use(this.renderer);
				// this.hasLightMapUniform.set(true);
			} else {
				Shader.emptyTexture.use(this.renderer);
				// this.hasLightMapUniform.set(false);
			}
		}

		// refmap
		if (this.renderer.options.enableEnvmap
			&& typeof mesh._refmap === "object" && mesh._refmap instanceof CubeMap && mesh._refmap.loaded) {
			this.refMapUniform.set(mesh._refmap);
			this.refMapTypeUniform.set(1);

			if (!mesh._refmap.bbox) {
				this.refmapBoxUniform.set(this.emptyBoundingBox);
			} else {
				this.refmapBoxUniform.set(mesh._refmap.bbox);
				this.refMapTypeUniform.set(2);
			}
		} else if (this._iblActive) {
			// fall back to the scene environment cubemap for specular IBL
			this.refMapUniform.set(this._sceneEnvMap);
			this.refmapBoxUniform.set(this.emptyBoundingBox);
			this.refMapTypeUniform.set(1);
		} else {
			this.refMapUniform.set(this.emptyCubemap);
			this.refMapTypeUniform.set(0);
		}
	}

	endObject(obj) {
		super.endObject(obj);
    
    const gl = this.renderer.gl;

		this.textureUniform.unset();
		this.lightMapUniform.unset();
		this.refMapUniform.unset();
    this.normalMapUniform.unset();
		this.metalRoughMapUniform.unset();
		this.aoMapUniform.unset();
		this.emissiveMapUniform.unset();

		gl.disable(gl.BLEND);
    gl.enable(gl.DEPTH_TEST);

    // skin
    if (obj.skin) {
      for (let i = 0; i < this.maxJointCount; i++) {
        this.jointMatrixUniforms[i].set(Matrix4.IdentityArray);
      }
    }
	}

}

export const LightLimitation = {
	Count: 15,
	Distance: 50,
}

