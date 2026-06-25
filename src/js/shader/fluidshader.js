
import { Shader } from '../webgl/shader.js';

// FluidShader — one thin wrapper reused by every simulation kernel
// (advect / force / emit / divergence / jacobi / project). The passes share a
// vertex stage and only differ in their fragment stage and which of a small set
// of uniforms they read, so rather than a bespoke class per pass we just cache
// the union of uniform locations into `this.u` and let the effect set whichever
// ones a given pass actually has. Locations for uniforms a pass does not
// declare come back null and are simply skipped.
//
// Samplers are bound per-pass by the effect (it sets the unit with uniform1i
// then binds the Volume3D to that unit), because the same logical name maps to
// different units in different passes (e.g. project reads velTex AND
// pressureTex), so a fixed name→unit table would not work.
const FLUID_UNIFORMS = [
	"uN", "zLayer", "dt", "dissipation",
	"buoyancy", "weight", "ambientTemp",
	"emitPos", "emitRadius", "emitDensity", "emitTemp",
	"velTex", "srcTex", "dcTex", "pressureTex", "divergenceTex",
];

export class FluidShader extends Shader {
	constructor(renderer, vertShaderSrc, fragShaderSrc) {
		super(renderer, vertShaderSrc, fragShaderSrc);
		this.use();

		const gl = this.gl;
		this.u = {};
		for (const name of FLUID_UNIFORMS) {
			this.u[name] = gl.getUniformLocation(this.glShaderProgramId, name);
		}
	}
}

// FluidRaymarchShader — renders the simulation's density volume to the (half-
// res) buffer with a simple emission/absorption march. Plain uniforms set per
// frame via setFrame(); the density sampler3D is bound manually (the generic
// "tex" uniform path assumes TEXTURE_2D).
export class FluidRaymarchShader extends Shader {
	constructor(renderer, vertShaderSrc, fragShaderSrc) {
		super(renderer, vertShaderSrc, fragShaderSrc);
		this.use();

		this.vertexPositionAttribute = this.findAttribute("vertexPosition");

		this.invViewProjUniform = this.bindUniform("invViewProj", "mat4");
		this.cameraPosUniform = this.bindUniform("cameraPos", "vec3");
		this.boxMinUniform = this.bindUniform("boxMin", "vec3");
		this.boxMaxUniform = this.bindUniform("boxMax", "vec3");
		this.densityScaleUniform = this.bindUniform("densityScale", "float");
		this.emissionStrengthUniform = this.bindUniform("emissionStrength", "float");
		this.smokeColorUniform = this.bindUniform("smokeColor", "color3");
		this.stepsUniform = this.bindUniform("steps", "int");

		this.densityTexLocation = this.gl.getUniformLocation(this.glShaderProgramId, "densityTex");
	}

	// `p` is the VolumetricFluid effect (per-frame state + tunables).
	setFrame(p) {
		this.invViewProjUniform.set(p.invViewProj);
		this.cameraPosUniform.set(p.cameraPos);
		this.boxMinUniform.set(p.boxMin);
		this.boxMaxUniform.set(p.boxMax);
		this.densityScaleUniform.set(p.densityScale);
		this.emissionStrengthUniform.set(p.emissionStrength);
		this.smokeColorUniform.set(p.smokeColor);
		this.stepsUniform.set(p.renderSteps | 0);

		if (p._density && this.densityTexLocation) {
			const gl = this.gl;
			gl.activeTexture(gl.TEXTURE0);
			gl.bindTexture(gl.TEXTURE_3D, p._density.read.glTexture);
			gl.uniform1i(this.densityTexLocation, 0);
		}
	}
}
