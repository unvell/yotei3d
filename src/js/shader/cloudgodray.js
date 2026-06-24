
import { Vec3, Matrix4 } from "@/math";
import { Shader } from '../webgl/shader.js';

// Full-screen ray-march that turns the sun-POV cloud transmittance map into
// volumetric god rays (see cloudgodray.frag). Drawn as the last object in the
// scene pass, additively, at the far plane so the depth test confines it to sky
// pixels. The CloudVolumetricLight effect pushes the cloud map, light matrix and
// all tuning onto this instance each frame; camera/sun come from the renderer.
export class CloudGodrayShader extends Shader {
	constructor(renderer, vertShaderSrc, fragShaderSrc) {
		super(renderer, vertShaderSrc, fragShaderSrc);

		this.use();

		this.vertexPositionAttribute = this.findAttribute("vertexPosition");

		this.invViewProjUniform = this.bindUniform("invViewProj", "mat4");
		this.cameraPosUniform = this.bindUniform("cameraPos", "vec3");
		this.sunDirUniform = this.bindUniform("sunDir", "vec3");
		this.sunColorUniform = this.bindUniform("sunColor", "color3");

		this.cloudMatrixUniform = this.bindUniform("cloudShadowMatrix", "mat4");
		this.cloudMapUniform = this.bindUniform("cloudShadowMap", "tex", 0);
		this.cloudDensityUniform = this.bindUniform("cloudDensity", "float");
		this.cloudBaseYUniform = this.bindUniform("cloudBaseY", "float");
		this.cloudTopYUniform = this.bindUniform("cloudTopY", "float");

		this.intensityUniform = this.bindUniform("intensity", "float");
		this.stepsUniform = this.bindUniform("steps", "int");
		this.maxDistUniform = this.bindUniform("maxDist", "float");
		this.phaseGUniform = this.bindUniform("phaseG", "float");
		this.scatterUniform = this.bindUniform("scatter", "float");
		this.startJitterUniform = this.bindUniform("startJitter", "float");

		// set per-frame by the effect
		this.cloudShadowMap = null;
		this.cloudShadowMatrix = null;
		this.density = 6.0;
		this.cloudBaseY = -1e9;
		this.cloudTopY = 1e9;
		this.color = [1.0, 0.92, 0.80];
		this.intensity = 1.0;
		this.steps = 64;
		this.maxDist = 1200;
		this.phaseG = 0.76;
		this.scatter = 1.0;
		this.startJitter = 1.0;

		this._identity = new Matrix4().loadIdentity();
	}

	beginObject(obj) {
		super.beginObject(obj);

		const r = this.renderer, gl = this.gl, scene = r.currentScene;

		this.invViewProjUniform.set(r.projectionViewMatrix.inverse());

		const cam = scene && scene.mainCamera;
		this.cameraPosUniform.set(cam ? cam.worldLocation : Vec3.zero);

		const sunDir = (scene && scene.sun) ? scene.sun.direction : new Vec3(0, 1, 0);
		this.sunDirUniform.set(sunDir);
		this.sunColorUniform.set(this.color);

		this.cloudMatrixUniform.set(this.cloudShadowMatrix || this._identity);
		this.cloudMapUniform.set(this.cloudShadowMap || Shader.emptyTexture);
		this.cloudDensityUniform.set(this.density);
		this.cloudBaseYUniform.set(this.cloudBaseY);
		this.cloudTopYUniform.set(this.cloudTopY);

		this.intensityUniform.set(this.intensity);
		this.stepsUniform.set(this.steps | 0);
		this.maxDistUniform.set(this.maxDist);
		this.phaseGUniform.set(this.phaseG);
		this.scatterUniform.set(this.scatter);
		this.startJitterUniform.set(this.startJitter);

		// additive, depth-tested (far plane), no depth write
		gl.enable(gl.BLEND);
		gl.blendFunc(gl.ONE, gl.ONE);
		gl.depthMask(false);
	}

	endObject(obj) {
		const gl = this.gl;

		gl.depthMask(true);
		gl.disable(gl.BLEND);
		gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE_MINUS_DST_ALPHA, gl.ONE);

		this.cloudMapUniform.unset();

		super.endObject(obj);
	}
}
