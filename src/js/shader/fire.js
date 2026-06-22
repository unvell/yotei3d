
import { Shader } from '../webgl/shader.js';

// Renders fire embers as soft, glowing additive point sprites.
// Driven by a ParticleMesh (position / color / size), like the snow & rain
// shaders. Each particle's colour already carries its life fade, so the
// fragment shader only shapes the soft sprite edge. Selected per-object via
// the FireMaterial (`shaderName === "fire"`); see the Fire effect.
export class FireShader extends Shader {
	constructor(renderer, vertShaderSrc, fragShaderSrc) {
		super(renderer, vertShaderSrc, fragShaderSrc);

		this.use();

		this.vertexPositionAttribute = this.findAttribute("vertexPosition");
		this.vertexColorAttribute = this.findAttribute("vertexColor");
		this.vertexSizeAttribute = this.findAttribute("vertexSize");

		this.projectViewModelMatrixUniform = this.bindUniform("projectViewModelMatrix", "mat4");
		this.opacityUniform = this.bindUniform("opacity", "float");

		// perspective size controls
		this.sizeScaleUniform = this.bindUniform("sizeScale", "float");
		this.maxSizeUniform = this.bindUniform("maxSize", "float");
	}

	beginObject(obj) {
		super.beginObject(obj);

		const gl = this.gl;

		this.projectViewModelMatrixUniform.set(obj._transform.mul(this.renderer.projectionViewMatrix));

		const mat = obj.mat;
		const num = (a, d) => typeof a === "number" ? a : d;
		this.opacityUniform.set(num(mat && mat.opacity, 1.0));
		this.sizeScaleUniform.set(num(mat && mat.sizeScale, 20));
		this.maxSizeUniform.set(num(mat && mat.maxSize, 128));

		// additive blending for the glow; depth test on (geometry occludes the
		// fire) but no depth write so embers don't fight each other.
		gl.enable(gl.BLEND);
		gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
		gl.depthMask(false);
	}

	endObject(obj) {
		const gl = this.gl;

		gl.depthMask(true);
		gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
		gl.disable(gl.BLEND);

		super.endObject(obj);
	}
}
