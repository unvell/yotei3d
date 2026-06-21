
import { Shader } from '../webgl/shader.js';

// Renders cloud puffs as soft, fbm-textured point sprites.
// Driven by a ParticleMesh (position / per-puff colour / size), like the snow
// shader. Selected per-object via `obj.shader = { name: "cloud" }` (see the
// Clouds effect). Per-vertex colour carries the puff's shading (bright tops,
// cool undersides), so there is no single colour uniform.
export class CloudShader extends Shader {
	constructor(renderer, vertShaderSrc, fragShaderSrc) {
		super(renderer, vertShaderSrc, fragShaderSrc);

		this.use();

		this.vertexPositionAttribute = this.findAttribute("vertexPosition");
		this.vertexColorAttribute = this.findAttribute("vertexColor");
		this.vertexSizeAttribute = this.findAttribute("vertexSize");

		this.projectViewModelMatrixUniform = this.bindUniform("projectViewModelMatrix", "mat4");
		this.opacityUniform = this.bindUniform("opacity", "float");
		this.sizeScaleUniform = this.bindUniform("sizeScale", "float");
		this.maxSizeUniform = this.bindUniform("maxSize", "float");
	}

	beginObject(obj) {
		super.beginObject(obj);

		const gl = this.gl;

		this.projectViewModelMatrixUniform.set(obj._transform.mul(this.renderer.projectionViewMatrix));

		this.opacityUniform.set(typeof obj.cloudOpacity === "number" ? obj.cloudOpacity : 0.85);
		this.sizeScaleUniform.set(typeof obj.sizeScale === "number" ? obj.sizeScale : 700);
		this.maxSizeUniform.set(typeof obj.maxSize === "number" ? obj.maxSize : 2000);

		// alpha blend; depth test on (geometry occludes puffs) but no depth
		// write so puffs within a cloud don't fight each other
		gl.enable(gl.BLEND);
		gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
		gl.depthMask(false);
	}

	endObject(obj) {
		const gl = this.gl;

		gl.depthMask(true);
		gl.disable(gl.BLEND);

		super.endObject(obj);
	}
}
