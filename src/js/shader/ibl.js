
import { Shader } from '../webgl/shader';

// Shader used to bake the diffuse irradiance cubemap from a source environment
// cubemap. Driven by IBLBaker (src/js/render/iblbaker.js): a fullscreen quad is
// rendered into each cube face while `faceForward/Right/Up` map fragment
// positions to world-space sample directions.
export class IrradianceShader extends Shader {
	constructor(renderer, vertShaderSrc, fragShaderSrc) {
		super(renderer, vertShaderSrc, fragShaderSrc);

		this.use();

		this.vertexPositionAttribute = this.findAttribute("vertexPosition");
		this.vertexTexcoordAttribute = this.findAttribute("vertexTexcoord");

		this.faceForwardUniform = this.bindUniform("faceForward", "vec3");
		this.faceRightUniform = this.bindUniform("faceRight", "vec3");
		this.faceUpUniform = this.bindUniform("faceUp", "vec3");

		this.envMapUniform = this.bindUniform("envMap", "texcube", 0);
	}

	setFace(forward, right, up) {
		this.faceForwardUniform.set(forward);
		this.faceRightUniform.set(right);
		this.faceUpUniform.set(up);
	}
}
