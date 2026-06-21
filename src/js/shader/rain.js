
import { Color3 } from "@jingwood/graphics-math";
import { Shader } from '../webgl/shader.js';

// Renders falling raindrops as slanted point-sprite streaks.
// Driven by a ParticleMesh (position / color / size buffers), the same
// vertex layout used by the standard point shader. Intended to be selected
// per-object via `obj.shader = { name: "rain" }` (see the Rain effect).
export class RainShader extends Shader {
	constructor(renderer, vertShaderSrc, fragShaderSrc) {
		super(renderer, vertShaderSrc, fragShaderSrc);

		this.use();

		// vertex attributes (match ParticleMesh: position, color, size)
		this.vertexPositionAttribute = this.findAttribute("vertexPosition");
		this.vertexColorAttribute = this.findAttribute("vertexColor");
		this.vertexSizeAttribute = this.findAttribute("vertexSize");

		// uniforms
		this.projectViewModelMatrixUniform = this.bindUniform("projectViewModelMatrix", "mat4");
		this.colorUniform = this.bindUniform("color", "vec3");
		this.opacityUniform = this.bindUniform("opacity", "float");
		this.streakWidthUniform = this.bindUniform("streakWidth", "float");
		this.slantUniform = this.bindUniform("slant", "float");

		this.defaultColor = [0.62, 0.74, 0.95];
	}

	beginObject(obj) {
		super.beginObject(obj);

		const gl = this.gl;

		this.projectViewModelMatrixUniform.set(obj._transform.mul(this.renderer.projectionViewMatrix));

		// tint
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

		// streak appearance
		this.opacityUniform.set(typeof obj.rainOpacity === "number" ? obj.rainOpacity : 0.5);
		this.streakWidthUniform.set(typeof obj.streakWidth === "number" ? obj.streakWidth : 0.14);
		this.slantUniform.set(typeof obj.slant === "number" ? obj.slant : 0.0);

		// additive-friendly alpha blending; keep depth testing so geometry
		// occludes the rain, but don't write depth so drops don't fight each other
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
