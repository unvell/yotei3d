
import { Shader } from '../webgl/shader';

// Shader that GGX-prefilters a source environment cubemap into the specular IBL
// map. Driven by IBLBaker.prefilterSpecular: a fullscreen quad is rendered into
// each face of each mip level while `faceForward/Right/Up` (from ibl.vert) map
// fragment positions to world-space directions, and `roughness` is raised with
// the mip index so coarser mips hold rougher reflections.
export class PrefilterSpecularShader extends Shader {
	constructor(renderer, vertShaderSrc, fragShaderSrc) {
		super(renderer, vertShaderSrc, fragShaderSrc);

		this.use();

		this.vertexPositionAttribute = this.findAttribute("vertexPosition");
		this.vertexTexcoordAttribute = this.findAttribute("vertexTexcoord");

		this.faceForwardUniform = this.bindUniform("faceForward", "vec3");
		this.faceRightUniform = this.bindUniform("faceRight", "vec3");
		this.faceUpUniform = this.bindUniform("faceUp", "vec3");

		// GGX roughness of the mip level currently being rendered (0 = mirror)
		this.roughnessUniform = this.bindUniform("roughness", "float");
		// source cube face size in texels, for the firefly-suppression mip bias
		this.resolutionUniform = this.bindUniform("resolution", "float");

		this.envMapUniform = this.bindUniform("envMap", "texcube", 0);
	}

	setFace(forward, right, up) {
		this.faceForwardUniform.set(forward);
		this.faceRightUniform.set(right);
		this.faceUpUniform.set(up);
	}
}
