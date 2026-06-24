
import { Shader } from '../webgl/shader.js';

// Wrapper for the volumetric-cloud raymarch (see volcloud.frag). The
// VolumetricClouds effect renders a full-screen quad with this into a half-res
// float buffer each frame, after setting the camera/sun/atmosphere uniforms via
// setFrame(). All values are plain uniforms (no per-object state), so the effect
// drives it directly rather than through begin/endObject.
export class VolumetricCloudShader extends Shader {
	constructor(renderer, vertShaderSrc, fragShaderSrc) {
		super(renderer, vertShaderSrc, fragShaderSrc);

		this.use();

		this.vertexPositionAttribute = this.findAttribute("vertexPosition");

		this.invViewProjUniform = this.bindUniform("invViewProj", "mat4");
		this.cameraPosUniform = this.bindUniform("cameraPos", "vec3");
		this.sunDirUniform = this.bindUniform("sunDir", "vec3");
		this.sunColorUniform = this.bindUniform("sunColor", "color3");
		this.ambientColorUniform = this.bindUniform("ambientColor", "color3");
		this.groundColorUniform = this.bindUniform("groundColor", "color3");

		this.cloudBaseYUniform = this.bindUniform("cloudBaseY", "float");
		this.cloudTopYUniform = this.bindUniform("cloudTopY", "float");
		this.coverageUniform = this.bindUniform("coverage", "float");
		this.extinctionUniform = this.bindUniform("extinction", "float");
		this.detailScaleUniform = this.bindUniform("detailScale", "float");
		this.baseFreqUniform = this.bindUniform("baseFreq", "float");
		this.timeUniform = this.bindUniform("time", "float");
		this.windDirUniform = this.bindUniform("windDir", "vec2");
		this.phaseGUniform = this.bindUniform("phaseG", "float");
		this.sunAbsorptionUniform = this.bindUniform("sunAbsorption", "float");
		this.maxDistUniform = this.bindUniform("maxDist", "float");
		this.stepsUniform = this.bindUniform("steps", "int");
		this.lightStepsUniform = this.bindUniform("lightSteps", "int");
	}

	// `p` is the VolumetricClouds effect (carries all tunables + per-frame state).
	setFrame(p) {
		this.invViewProjUniform.set(p.invViewProj);
		this.cameraPosUniform.set(p.cameraPos);
		this.sunDirUniform.set(p.sunDir);
		this.sunColorUniform.set(p.sunColor);
		this.ambientColorUniform.set(p.ambientColor);
		this.groundColorUniform.set(p.groundColor);

		this.cloudBaseYUniform.set(p.cloudBaseY);
		this.cloudTopYUniform.set(p.cloudTopY);
		this.coverageUniform.set(p.coverage);
		this.extinctionUniform.set(p.extinction);
		this.detailScaleUniform.set(p.detailScale);
		this.baseFreqUniform.set(p.baseFreq);
		this.timeUniform.set(p.time);
		this.windDirUniform.set(p.windDir);
		this.phaseGUniform.set(p.phaseG);
		this.sunAbsorptionUniform.set(p.sunAbsorption);
		this.maxDistUniform.set(p.maxDist);
		this.stepsUniform.set(p.steps | 0);
		this.lightStepsUniform.set(p.lightSteps | 0);
	}
}
