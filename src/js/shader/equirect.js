
import { Shader } from '../webgl/shader';

// Shader that projects a loaded equirectangular HDR panorama (a 2D texture)
// into a cubemap. Driven by IBLBaker.equirectToCubemap: a fullscreen quad is
// rendered into each cube face while `faceForward/Right/Up` (from ibl.vert)
// map fragment positions to world-space sample directions.
export class EquirectShader extends Shader {
	constructor(renderer, vertShaderSrc, fragShaderSrc) {
		super(renderer, vertShaderSrc, fragShaderSrc);

		this.use();

		this.vertexPositionAttribute = this.findAttribute("vertexPosition");
		this.vertexTexcoordAttribute = this.findAttribute("vertexTexcoord");

		this.faceForwardUniform = this.bindUniform("faceForward", "vec3");
		this.faceRightUniform = this.bindUniform("faceRight", "vec3");
		this.faceUpUniform = this.bindUniform("faceUp", "vec3");

		// azimuth rotation of the environment (radians), baked into the cubemap
		this.yawUniform = this.bindUniform("yaw", "float");

		this.equirectMapUniform = this.bindUniform("equirectMap", "tex", 0);
	}

	setFace(forward, right, up) {
		this.faceForwardUniform.set(forward);
		this.faceRightUniform.set(right);
		this.faceUpUniform.set(up);
	}
}
