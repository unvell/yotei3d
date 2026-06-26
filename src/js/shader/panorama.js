
import { Shader } from '../webgl/shader.js';
import { CubeMap } from '../webgl/cubemap.js';

export class PanoramaShader extends Shader {
	constructor(renderer, vertShaderSrc, fragShaderSrc) {
		super(renderer, vertShaderSrc, fragShaderSrc);
		
		this.use();

		this.vertexPositionAttribute = this.findAttribute("vertexPosition");
		// this.vertexNormalAttribute = this.findAttribute("vertexNormal");
		// this.vertexTexcoordAttribute = this.findAttribute("vertexTexcoord");
	
		this.projectViewModelMatrixUniform = this.bindUniform("projectViewModelMatrix", "mat4");
		// this.modelMatrixUniform = this.findUniform("modelMatrix");
		// this.normalMatrixUniform = this.findUniform("normalMatrix");

		// this.sundirUniform = this.bindUniform("sundir", "vec3");
		// this.sunlightUniform = this.bindUniform("sunlight", "vec3");

		this.textureUniform = this.bindUniform("texture", "tex", 0);
		this.colorUniform = this.bindUniform("color", "color3");
		this.hdrSourceUniform = this.bindUniform("hdrSource", "bool");

		// horizon haze (scene.skyFog) — fades the lower sky into the fog colour
		this.hasSkyFogUniform = this.bindUniform("hasSkyFog", "bool");
		this.skyFogColorUniform = this.bindUniform("skyFogColor", "color3");
		this.skyFogUpperUniform = this.bindUniform("skyFogUpper", "float");
		this.skyFogLowerUniform = this.bindUniform("skyFogLower", "float");
		this.skyFogDensityUniform = this.bindUniform("skyFogDensity", "float");
		// this.texTilingUniform = this.findUniform("texTiling");
		// this.opacityUniform = this.bindUniform("opacity", "float");

		// empty cubemap
		this.emptyCubemap = new CubeMap(renderer);
		this.emptyCubemap.enableMipmap = false;
		this.emptyCubemap.createEmpty();
	}


	// PanoramaShader.prototype.beginScene = function(scene) {
	// 	Shader.prototype.beginScene.call(this, scene);


	// 	// // sun
	// 	// if (typeof scene.sun === "object" && scene.sun != null) {
	// 	// 	var sunloc = scene.sun.worldLocation;
	// 	// 	var sundir = Vec3.normalize(sunloc);
	// 	// 	this.sundirUniform.set(sundir);
		
	// 	// 	var mat = scene.sun.mat || null;
	// 	// 	var suncolor = (mat && mat.color) || this.defaultSunColor;

	// 	// 	this.sunlightUniform.set(suncolor.mul(Vec3.dot(sundir, Vec3.up)).toArray());
	// 	// }

	// };

	beginObject(obj) {
		super.beginObject(obj);

		const gl = this.gl;
	
		var modelMatrix = obj._transform;
		
		this.projectViewModelMatrixUniform.set(
			modelMatrix.mul(this.renderer.projectionViewMatrix));

		// gl.uniformMatrix4fv(this.modelMatrixUniform, false, modelMatrix.toArray());

		// var normalMatrix = new Matrix4(modelMatrix);
		// normalMatrix.inverse();
		// normalMatrix.transpose();

		// gl.uniformMatrix4fv(this.normalMatrixUniform, false, normalMatrix.toArray());

		// material
		const mat = obj.mat;

		let texture = null;
		let color = null;

		if (mat) {
			// texture
			if (mat.tex && mat.tex instanceof CubeMap) {
				texture = mat.tex;
			}
	
      // color
      if (mat.color) {
        color = mat.color;
      }
		}

		// texture
		if (texture) {
			this.textureUniform.set(texture);
    } else {
      this.textureUniform.set(this.emptyCubemap);
		}

		// Colour-space of the sky source: HDR panoramas are already linear float;
		// LDR cubemap faces are sRGB and get decoded to linear in the shader. Both
		// are then tone-mapped + encoded once in the final screen pass.
		const scene = this.renderer.currentScene;
		this.hdrSourceUniform.set(!!(texture && texture.hdr));

		// Horizon haze: opt-in via scene.skyFog. Defaults its colour to the
		// scene fog colour (or the renderer back colour) so it matches a fogged
		// ocean/ground plane out of the box; the seam between the two dissolves.
		const skyFog = scene && scene.skyFog;
		if (skyFog && skyFog.enabled !== false) {
			this.hasSkyFogUniform.set(true);
			let c = skyFog.color || (scene.fog && scene.fog.color);
			if (!c) {
				const bc = this.renderer.options.backColor;
				c = bc ? [bc.r !== undefined ? bc.r : bc[0],
				          bc.g !== undefined ? bc.g : bc[1],
				          bc.b !== undefined ? bc.b : bc[2]] : [0.8, 0.8, 0.8];
			}
			this.skyFogColorUniform.set(c);
			this.skyFogUpperUniform.set(typeof skyFog.upper === "number" ? skyFog.upper : 0.25);
			this.skyFogLowerUniform.set(typeof skyFog.lower === "number" ? skyFog.lower : -0.05);
			this.skyFogDensityUniform.set(typeof skyFog.density === "number" ? skyFog.density : 1.0);
		} else {
			this.hasSkyFogUniform.set(false);
		}

		// color
		if (color) {
			this.colorUniform.set(color);
		} else {
      this.colorUniform.set([1, 1, 1]);
		}

		// // opacity
		// if (obj._opacity < 1.0) {
		// 	gl.enable(gl.BLEND);
		// 	//gl.disable(gl.DEPTH_TEST);
		// 	this.opacityUniform.set(obj._opacity);
		// } else {
		// 	this.opacityUniform.set(1.0);
		// }

		gl.cullFace(gl.FRONT);
		// gl.disable(gl.DEPTH_TEST);
	}

	endObject(obj) {
		const gl = this.renderer.gl;

		// gl.disable(gl.BLEND);
		//gl.enable(gl.DEPTH_TEST);
		gl.cullFace(gl.BACK);
	
		super.endObject(obj);
	}
}