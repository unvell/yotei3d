
import "../webgl/shader.js"
import { Vec3, Color3, Matrix4 } from "@jingwood/graphics-math";
import { BoundingBox3D } from "@jingwood/graphics-math";
import { MathFunctions } from "@jingwood/graphics-math";
import { Shader } from '../webgl/shader.js';

Shaders.PBRShader = class extends Shader {
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

		this.sundirUniform = this.bindUniform("sundir", "vec3");
		this.sunlightUniform = this.bindUniform("sunlight", "color3");
	
		this.receiveLightUniform = this.bindUniform("receiveLight", "bool");
		this.receiveShadowUniform = this.bindUniform("receiveShadow", "bool");
		this.opacityUniform = this.bindUniform("opacity", "float");
		this.colorUniform = this.bindUniform("color", "color3");
		this.texTilingUniform = this.bindUniform("texTiling", "vec2");
		this.glossyUniform = this.bindUniform("glossy", "float");
		this.roughnessUniform = this.bindUniform("roughness", "float");
		this.emissionUniform = this.bindUniform("emission", "float");
		this.normalMipmapUniform = this.bindUniform("normalMipmap", "float");
		this.normalIntensityUniform = this.bindUniform("normalIntensity", "float");
	
		this.textureUniform = this.bindUniform("texture", "tex", 0);
		this.normalMapUniform = this.bindUniform("normalMap", "tex", 1);
		this.lightMapUniform = this.bindUniform("lightMap", "tex", 2);
		this.u_brdfLUTUniform = this.bindUniform("u_brdfLUT", "tex", 3);
		this.u_DiffuseEnvSamplerUniform = this.bindUniform("u_DiffuseEnvSampler", "texcube", 4);
		this.refMapUniform = this.bindUniform("u_SpecularEnvSampler", "texcube", 5);

		this.hasTextureUniform = this.bindUniform("hasTexture", "bool");
		this.hasLightMapUniform = this.bindUniform("hasLightMap", "bool");
		this.refMapTypeUniform = this.bindUniform("refMapType", "int");
		this.shadowMapTypeUniform = this.bindUniform("shadowMapType", "int");
		this.hasNormalMapUniform = this.bindUniform("hasNormalMap", "bool");
		this.hasUV2Uniform = this.bindUniform("hasUV2", "bool");

		this.cameraLocUniform = this.bindUniform("cameraLoc", "vec3");
		this.refmapBoxUniform = this.bindUniform("refMapBox", "bbox");

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

		this.renderer.createTextureFromURL("/static/textures/brdfLUT.png", tex => {
			this.u_brdfLUTTex = tex;
		});
	}

	beginScene(scene) {
		super.beginScene(scene);
	
		this.projectViewMatrixUniform.set(this.renderer.projectionViewMatrixArray);

		// camera
		const cameraLocation = scene.mainCamera ? scene.mainCamera.worldLocation : Vec3.zero;
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
        if (!lightUniform) break;

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

		if (this._shadowMap2D && this._shadowMap2D instanceof Texture) {
			this.shadowMapTypeUniform.set(1);
			this.shadowMapUniform.tex2d.set(this._shadowMap2D);
			this.shadowMapUniform.texcube.set(this.emptyCubemap);
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

		if (this.u_brdfLUTTex
			&& !this.u_brdfLUTTex.isLoading
			&& this.u_brdfLUTTex.image
			&& this.u_brdfLUTTex.image.complete) {
			this.u_brdfLUTUniform.set(this.u_brdfLUTTex);
		} else {
			this.u_brdfLUTUniform.set(Shader.emptyTexture);
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

		const mat = obj.mat;
		// var transparency = 0;
		this.usingLightmap = undefined;
	
    if (mat) {
      // texture
      if (mat.tex && (mat.tex instanceof Texture)
        && !mat.tex.isLoading && mat.tex.image && mat.tex.image.complete) {
        this.textureUniform.set(mat.tex);
        this.hasTextureUniform.set(true);
      } else {
        this.textureUniform.set(Shader.emptyTexture);
        this.hasTextureUniform.set(false);
      }
			
      // normal-map
      if (this.renderer.options.enableNormalMap
        && mat.normalmap && (mat.normalmap instanceof Texture)
        && !mat.normalmap.isLoading && mat.normalmap.image && mat.normalmap.image.complete) {

        this.normalMapUniform.set(mat.normalmap);
        this.modelMatrix3x3Uniform.set(modelMatrix);
        this.hasNormalMapUniform.set(true);
        
        let normalMipmap = 0;
        if (typeof mat.normalMipmap !== "undefined") {
          normalMipmap = -MathFunctions.clamp(mat.normalMipmap, 0, 5) * 5;
        }
        this.normalMipmapUniform.set(normalMipmap);
      
        let normalIntensity = 1.0;
        if (typeof mat.normalIntensity !== "undefined") {
          normalIntensity = mat.normalIntensity;
        }
        this.normalIntensityUniform.set(normalIntensity);
      } else {
        this.normalMapUniform.set(Shader.emptyTexture);
        this.hasNormalMapUniform.set(false);
      }

			// color
			if (mat.color) {
				this.colorUniform.set(mat.color);
			} else {
				this.colorUniform.set(Color3.black);
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
			if (mat.roughness !== undefined) {
				this.roughnessUniform.set(mat.roughness);
			} else {
				this.roughnessUniform.set(0.5);
			}
		
			// glossy
			if (mat.glossy) {
				this.glossyUniform.set(mat.glossy);
			} else {
				this.glossyUniform.set(0.3);
			}

			// // transparency
			// if (typeof mat.transparency !== "undefined" && mat.transparency > 0) {
			// 	transparency = mat.transparency;
			// }
		}

		// lightmap
		if (this.renderer.options.enableLightmap
			&& obj.lightmap && (obj.lightmap instanceof Texture)
			&& !obj.lightmap.isLoading) {
			this.lightMapUniform.set(obj.lightmap);
			this.hasLightMapUniform.set(true);
		} else {
			this.lightMapUniform.set(Shader.emptyTexture);
			this.hasLightMapUniform.set(false);
		}

		// refmap
		if (this.renderer.options.enableEnvmap
			&& typeof obj.refmap && (obj.refmap instanceof CubeMap) && obj.refmap.loaded) {
			this.refMapUniform.set(obj.refmap);
			this.u_DiffuseEnvSamplerUniform.set(obj.refmap);
		
			if (!obj.refmap.bbox) {
				this.refmapBoxUniform.set(this.emptyBoundingBox);
				this.refMapTypeUniform.set(1);
			} else {
				this.refmapBoxUniform.set(obj.refmap.bbox);
				this.refMapTypeUniform.set(2);
			}
		} else {
			this.refMapUniform.set(this.emptyCubemap);
			this.u_DiffuseEnvSamplerUniform.set(this.emptyCubemap);
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
		if (this._shadowMap2D) {
			const shadowMapShader = ShaderSources.shadowmap.instance;
			if (shadowMapShader) {
				const m = modelMatrix.mul(shadowMapShader.lightMatrix).mul(shadowMapShader.projectionMatrix);
				this.shadowMapProjectionMatrixUniform.set(m);
			}
		}
	}

	beginMesh(mesh) {
		super.beginMesh(mesh);
	
		var gl = this.gl;

		this.hasUV2Uniform.set(mesh.meta && mesh.meta.uvCount > 1);

		// lightmap
		if (this.usingLightmap === null) {
			gl.activeTexture(gl.TEXTURE2);
			if (this.renderer.options.enableLightmap
				&& typeof mesh._lightmap === "object" && mesh._lightmap instanceof Texture
				&& !mesh._lightmap.isLoading) {
				this.usingLightmap = mesh._lightmap;
				this.usingLightmap.use(this.renderer);
				this.hasLightMapUniform.set(true);
			} else {
				Shader.emptyTexture.use(this.renderer);
				this.hasLightMapUniform.set(false);
			}
		}

		// refmap
		if (this.renderer.options.enableEnvmap
			&& typeof mesh._refmap === "object" && mesh._refmap instanceof CubeMap && mesh._refmap.loaded) {
			this.refMapUniform.set(mesh._refmap);
			this.u_DiffuseEnvSamplerUniform.set(mesh._refmap);
		
			if (!mesh._refmap.bbox) {
				this.refmapBoxUniform.set(this.emptyBoundingBox);
				this.refMapTypeUniform.set(1);
			} else {
				this.refmapBoxUniform.set(mesh._refmap.bbox);
				this.refMapTypeUniform.set(2);
			}
		} else {
			this.refMapUniform.set(this.emptyCubemap);
			this.u_DiffuseEnvSamplerUniform.set(this.emptyCubemap);
			this.refMapTypeUniform.set(0);
		}
  }
  
	endObject(obj) {
		var gl = this.renderer.gl;

		this.textureUniform.unset();
    this.normalMapUniform.unset();
		this.lightMapUniform.unset();
    this.refMapUniform.unset();

		gl.disable(gl.BLEND);
		gl.enable(gl.DEPTH_TEST);

		super.endObject(obj);
	}
};
