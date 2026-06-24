
import { Shader } from '../webgl/shader';

// Shader that renders a procedural single-scattering (Rayleigh + Mie) sky into a
// cubemap. Driven by IBLBaker.bakeProceduralSky: a fullscreen quad is rendered
// into each cube face while `faceForward/Right/Up` (from ibl.vert) map fragment
// positions to world-space view directions. Output is linear HDR radiance, so
// the baked cubemap feeds both the skybox background and image-based lighting
// exactly like a loaded HDR environment — but it regenerates as the sun moves.
export class AtmosphereSkyShader extends Shader {
	constructor(renderer, vertShaderSrc, fragShaderSrc) {
		super(renderer, vertShaderSrc, fragShaderSrc);

		this.use();

		this.vertexPositionAttribute = this.findAttribute("vertexPosition");
		this.vertexTexcoordAttribute = this.findAttribute("vertexTexcoord");

		// per-face basis (world dir = forward + right * s + up * t)
		this.faceForwardUniform = this.bindUniform("faceForward", "vec3");
		this.faceRightUniform = this.bindUniform("faceRight", "vec3");
		this.faceUpUniform = this.bindUniform("faceUp", "vec3");

		// sun + atmosphere parameters
		this.sunDirectionUniform = this.bindUniform("sunDirection", "vec3");
		this.sunIntensityUniform = this.bindUniform("sunIntensity", "float");
		this.rayleighCoeffUniform = this.bindUniform("rayleighCoeff", "vec3");
		this.mieCoeffUniform = this.bindUniform("mieCoeff", "float");
		this.rayleighScaleUniform = this.bindUniform("rayleighScale", "float");
		this.mieScaleUniform = this.bindUniform("mieScale", "float");
		this.mieGUniform = this.bindUniform("mieG", "float");
		this.planetRadiusUniform = this.bindUniform("planetRadius", "float");
		this.atmosphereRadiusUniform = this.bindUniform("atmosphereRadius", "float");
		this.groundAlbedoUniform = this.bindUniform("groundAlbedo", "vec3");
	}

	setFace(forward, right, up) {
		this.faceForwardUniform.set(forward);
		this.faceRightUniform.set(right);
		this.faceUpUniform.set(up);
	}

	// `params` carries the atmosphere tunables (see DynamicSky.params).
	setAtmosphere(sunDirection, params) {
		this.sunDirectionUniform.set(sunDirection);
		this.sunIntensityUniform.set(params.sunIntensity);
		this.rayleighCoeffUniform.set(params.rayleighCoeff);
		this.mieCoeffUniform.set(params.mieCoeff);
		this.rayleighScaleUniform.set(params.rayleighScale);
		this.mieScaleUniform.set(params.mieScale);
		this.mieGUniform.set(params.mieG);
		this.planetRadiusUniform.set(params.planetRadius);
		this.atmosphereRadiusUniform.set(params.atmosphereRadius);
		this.groundAlbedoUniform.set(params.groundAlbedo);
	}
}
