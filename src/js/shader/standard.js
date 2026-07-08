
import { Vec2, Vec3, Color3, Color4, Matrix4 } from "@/math";
import { BoundingBox3D, MathFunctions } from "@/math";

import { Shader } from "../webgl/shader"
import { Texture  } from "../webgl/texture";
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
		// sharp source env cube — paired with refMap (the GGX prefilter) so the
		// indirect-specular term reads a seam-free mirror at low roughness and the
		// smooth prefilter blur at high roughness (see standard.frag).
		this.envSharpMapUniform = this.bindUniform("envSharpMap", "texcube", 11);

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
		this.ambientColorUniform = this.bindUniform("ambientColor", "color3");

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

		// distance fog
		this.hasFogUniform = this.bindUniform("hasFog", "bool");
		this.fogColorUniform = this.bindUniform("fogColor", "color3");
		this.fogNearUniform = this.bindUniform("fogNear", "float");
		this.fogFarUniform = this.bindUniform("fogFar", "float");

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

		// cloud shadow (sun-POV transmittance map, projected onto the scene). Set
		// per-frame by the CloudVolumetricLight effect via `_cloudShadowMap` etc.;
		// a no-op when absent. See cloudmap.frag + the CloudVolumetricLight effect.
		this.hasCloudShadowUniform = this.bindUniform("hasCloudShadow", "bool");
		this.cloudShadowMapUniform = this.bindUniform("cloudShadowMap", "tex", 10);
		this.cloudShadowMatrixUniform = this.bindUniform("cloudShadowMatrix", "mat4");
		this.cloudShadowDensityUniform = this.bindUniform("cloudShadowDensity", "float");
		this.cloudShadowIntensityUniform = this.bindUniform("cloudShadowIntensity", "float");
		
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

		// distance fog — opt-in via scene.fog = { near, far, color? }.
		// Colour defaults to the background so geometry fades into the sky.
		const fog = scene.fog;
		if (fog && fog.enabled !== false) {
			this.hasFogUniform.set(true);

			let fogColor = fog.color;
			if (!fogColor) {
				const bc = this.renderer.options.backColor;
				fogColor = bc ? [bc.r, bc.g, bc.b] : [0.8, 0.8, 0.8];
			}
			this.fogColorUniform.set(fogColor);
			this.fogNearUniform.set(typeof fog.near === "number" ? fog.near : 10);
			this.fogFarUniform.set(typeof fog.far === "number" ? fog.far : 100);
		} else {
			this.hasFogUniform.set(false);
		}

		// lights
		let lightCount = 0;

		{
			lightCount = scene._activedLightSources.length;
			// never index past the shader's light uniform array (lights[MAX_LIGHT_COUNT])
			if (lightCount > this.lightUniforms.length) lightCount = this.lightUniforms.length;

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

		// sun (directional light). Aimed by sun.direction; sun.intensity scales
		// its colour and 0 disables it (replaces the old enableLighting flag).
		let sunActive = false;
		if (scene.sun !== undefined) {
			const sun = scene.sun;
			const intensity = (typeof sun.intensity === "number") ? sun.intensity : 1.0;
			sunActive = intensity > 0;

			this.sundirUniform.set(sun.direction);

			let c = (sun.mat && sun.mat.color) || Shader.defaultSunColor;
			const cr = (c.r !== undefined ? c.r : c[0]) * intensity;
			const cg = (c.g !== undefined ? c.g : c[1]) * intensity;
			const cb = (c.b !== undefined ? c.b : c[2]) * intensity;
			this.sunlightUniform.set([cr, cg, cb]);
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

		// cloud shadow (projected sun-POV transmittance) — independent of the
		// hard shadow map above; darkens the sun term where clouds occlude it.
		if (this._cloudShadowMap && this._cloudShadowMap instanceof Texture) {
			this.hasCloudShadowUniform.set(true);
			this.cloudShadowMapUniform.set(this._cloudShadowMap);
			this.cloudShadowMatrixUniform.set(this._cloudShadowMatrix);
			this.cloudShadowDensityUniform.set(typeof this._cloudShadowDensity === "number" ? this._cloudShadowDensity : 6.0);
			this.cloudShadowIntensityUniform.set(typeof this._cloudShadowIntensity === "number" ? this._cloudShadowIntensity : 0.8);
		} else {
			this.hasCloudShadowUniform.set(false);
			this.cloudShadowMapUniform.set(Shader.emptyTexture);
		}

		// IBL is automatic: active whenever the scene's image-based environment
		// has been baked into irradiance + specular cubemaps (no enableEnvmap gate).
		const iblActive = scene._iblIrradianceMap instanceof CubeMap && scene._iblIrradianceMap.loaded
			&& scene._iblEnvMap instanceof CubeMap && scene._iblEnvMap.loaded;

		this._iblActive = iblActive;
		// specular IBL samples the GGX-prefiltered chain when present (roughness
		// blurs the reflection physically); falls back to the sharp source env.
		const specMap = (scene._iblSpecularMap instanceof CubeMap && scene._iblSpecularMap.loaded)
			? scene._iblSpecularMap : scene._iblEnvMap;
		this._sceneEnvMap = iblActive ? specMap : null;
		// sharp source env cube, paired with the (prefiltered) specular map so the
		// shader can keep a crisp mirror at low roughness; same cube when there is
		// no separate prefilter, so the shader's low/high-roughness blend is a no-op.
		this._sceneSharpEnvMap = iblActive ? scene._iblEnvMap : null;

		// These drive the unified ambient path and must be valid every frame —
		// even for scenes that have only a per-object specular refMap (no baked
		// irradiance) or only light probes. `hasIBL` gates the *diffuse
		// irradiance* term specifically; specular keys off refMapType in-shader.
		// the direct sun is on when the scene's sun has non-zero intensity
		this.useDirectSunUniform.set(sunActive);

		// IBL strength/tint live on the environment: scene.skybox.intensity /
		// scene.skybox.tint (scene.skybox aliases scene.environment).
		const env = scene.environment;
		const iblIntensity = (env && typeof env.intensity === "number") ? env.intensity : 1.0;
		const iblTint = (env && env.tint) || this.defaultIBLColor;
		this.iblIntensityUniform.set(iblIntensity);
		this.maxEnvLodUniform.set(typeof scene._iblMaxLod === "number" ? scene._iblMaxLod : 6.0);
		this.iblColorUniform.set(iblTint);

		// constant-colour environment fallback (SimpleSky). [0,0,0] when the
		// environment is image-based, since IBL irradiance is used instead.
		this.ambientColorUniform.set(scene.ambientColor || [0, 0, 0]);

		if (iblActive) {
			this.hasIBLUniform.set(true);
			this.irradianceMapUniform.set(scene._iblIrradianceMap);
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
		if (typeof obj.refmap && (obj.refmap instanceof CubeMap) && obj.refmap.loaded) {
			this.refMapUniform.set(obj.refmap);
			this.envSharpMapUniform.set(obj.refmap); // no separate prefilter for a per-object probe
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
			this.envSharpMapUniform.set(this._sceneSharpEnvMap);
			this.refmapBoxUniform.set(this.emptyBoundingBox);
			this.refMapTypeUniform.set(1);
		} else {
			this.refMapUniform.set(this.emptyCubemap);
			this.envSharpMapUniform.set(this.emptyCubemap);
			this.refMapTypeUniform.set(0);
		}

		// opacity
		if (obj.__opacity < 1) {
      gl.enable(gl.BLEND);
			// additive blending for glowing effects (e.g. an afterburner plume):
			// layers build up toward a bright core and don't occlude each other.
			if (obj.mat && obj.mat.additive) {
				gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
				gl.depthMask(false);
			}
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

    // skin joint/weight attributes are now recorded in the mesh VAO
    // (Mesh.setupVertexAttributes); joint matrices are still set per object.

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
		if (typeof mesh._refmap === "object" && mesh._refmap instanceof CubeMap && mesh._refmap.loaded) {
			this.refMapUniform.set(mesh._refmap);
			this.envSharpMapUniform.set(mesh._refmap); // no separate prefilter for a per-object probe
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
			this.envSharpMapUniform.set(this._sceneSharpEnvMap);
			this.refmapBoxUniform.set(this.emptyBoundingBox);
			this.refMapTypeUniform.set(1);
		} else {
			this.refMapUniform.set(this.emptyCubemap);
			this.envSharpMapUniform.set(this.emptyCubemap);
			this.refMapTypeUniform.set(0);
		}
	}

	endObject(obj) {
		super.endObject(obj);
    
    const gl = this.renderer.gl;

		this.textureUniform.unset();
		this.lightMapUniform.unset();
		this.refMapUniform.unset();
		this.envSharpMapUniform.unset();
    this.normalMapUniform.unset();
		this.metalRoughMapUniform.unset();
		this.aoMapUniform.unset();
		this.emissiveMapUniform.unset();

		gl.disable(gl.BLEND);
		// restore the renderer's default blend func + depth write, in case this
		// object used additive blending above.
		gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE_MINUS_DST_ALPHA, gl.ONE);
		gl.depthMask(true);
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

