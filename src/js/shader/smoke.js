
import { Color3 } from "@/math";
import { Shader } from '../webgl/shader.js';

// Renders smoke as soft, semi-transparent grey point sprites.
// Driven by a ParticleMesh (position / color / size); the per-puff life alpha
// rides in the colour buffer's red channel while the grey tint comes from the
// material colour. Selected per-object via the SmokeMaterial
// (`shaderName === "smoke"`); see the Smoke effect.
export class SmokeShader extends Shader {
	constructor(renderer, vertShaderSrc, fragShaderSrc) {
		super(renderer, vertShaderSrc, fragShaderSrc);

		this.use();

		this.vertexPositionAttribute = this.findAttribute("vertexPosition");
		this.vertexColorAttribute = this.findAttribute("vertexColor");
		this.vertexSizeAttribute = this.findAttribute("vertexSize");

		this.projectViewModelMatrixUniform = this.bindUniform("projectViewModelMatrix", "mat4");
		this.colorUniform = this.bindUniform("color", "vec3");
		this.opacityUniform = this.bindUniform("opacity", "float");

		// perspective size controls
		this.sizeScaleUniform = this.bindUniform("sizeScale", "float");
		this.maxSizeUniform = this.bindUniform("maxSize", "float");

		this.defaultColor = [0.5, 0.5, 0.52];
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

		const num = (a, d) => typeof a === "number" ? a : d;
		this.opacityUniform.set(num(mat && mat.opacity, 0.5));
		this.sizeScaleUniform.set(num(mat && mat.sizeScale, 20));
		this.maxSizeUniform.set(num(mat && mat.maxSize, 256));

		// straight alpha blend; depth test on (geometry occludes the smoke) but
		// no depth write so puffs don't fight each other.
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
