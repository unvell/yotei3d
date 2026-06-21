
import { Color3 } from "@jingwood/graphics-math";
import { Shader } from '../webgl/shader.js';

// Renders snowflakes as soft round point sprites.
// Driven by a ParticleMesh (position / color / size), like the rain shader.
// Selected per-object via `obj.shader = { name: "snow" }` (see the Snow effect).
export class SnowShader extends Shader {
	constructor(renderer, vertShaderSrc, fragShaderSrc) {
		super(renderer, vertShaderSrc, fragShaderSrc);

		this.use();

		this.vertexPositionAttribute = this.findAttribute("vertexPosition");
		this.vertexColorAttribute = this.findAttribute("vertexColor");
		this.vertexSizeAttribute = this.findAttribute("vertexSize");

		this.projectViewModelMatrixUniform = this.bindUniform("projectViewModelMatrix", "mat4");
		this.colorUniform = this.bindUniform("color", "vec3");
		this.opacityUniform = this.bindUniform("opacity", "float");

		// perspective size + near-blur (depth of field) controls
		this.sizeScaleUniform = this.bindUniform("sizeScale", "float");
		this.maxSizeUniform = this.bindUniform("maxSize", "float");
		this.focusDistUniform = this.bindUniform("focusDist", "float");
		this.focusRangeUniform = this.bindUniform("focusRange", "float");

		this.defaultColor = [1.0, 1.0, 1.0];
	}

	beginObject(obj) {
		super.beginObject(obj);

		const gl = this.gl;

		this.projectViewModelMatrixUniform.set(obj._transform.mul(this.renderer.projectionViewMatrix));

		let color = this.defaultColor;
		const mat = obj.mat;
		if (mat && typeof mat.color === "object") {
			if (Array.isArray(mat.color)) {
				color = mat.color;
			} else if (mat.color instanceof Color3) {
				color = mat.color.toArray();
			}
		}
		this.colorUniform.set(color);

		this.opacityUniform.set(typeof obj.snowOpacity === "number" ? obj.snowOpacity : 0.9);

		this.sizeScaleUniform.set(typeof obj.sizeScale === "number" ? obj.sizeScale : 20);
		this.maxSizeUniform.set(typeof obj.maxSize === "number" ? obj.maxSize : 64);
		this.focusDistUniform.set(typeof obj.focusDist === "number" ? obj.focusDist : 12);
		this.focusRangeUniform.set(typeof obj.focusRange === "number" ? obj.focusRange : 10);

		// alpha blend; depth test on (geometry occludes flakes) but no depth
		// write so flakes don't fight each other
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
