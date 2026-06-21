
import { Color3 } from "@jingwood/graphics-math";
import { Shader } from '../webgl/shader.js';

// Renders a horizontal plane as procedural, drifting ground fog.
// Selected per-object via `obj.shader = { name: "groundfog" }` (see GroundFog).
export class GroundFogShader extends Shader {
	constructor(renderer, vertShaderSrc, fragShaderSrc) {
		super(renderer, vertShaderSrc, fragShaderSrc);

		this.use();

		this.vertexPositionAttribute = this.findAttribute("vertexPosition");

		this.projectViewModelMatrixUniform = this.bindUniform("projectViewModelMatrix", "mat4");
		this.modelMatrixUniform = this.bindUniform("modelMatrix", "mat4");

		this.colorUniform = this.bindUniform("fogColor", "vec3");
		this.opacityUniform = this.bindUniform("opacity", "float");
		this.densityUniform = this.bindUniform("density", "float");
		this.noiseScaleUniform = this.bindUniform("noiseScale", "float");
		this.flow1Uniform = this.bindUniform("flow1", "vec2");
		this.flow2Uniform = this.bindUniform("flow2", "vec2");

		this.defaultColor = [0.62, 0.66, 0.72];
	}

	beginObject(obj) {
		super.beginObject(obj);

		const gl = this.gl;

		this.projectViewModelMatrixUniform.set(obj._transform.mul(this.renderer.projectionViewMatrix));
		this.modelMatrixUniform.set(obj._transform);

		// All fog parameters come from the GroundFogMaterial (obj.mat); the
		// legacy per-object fields (obj.fogColor, obj._flow1, ...) are kept as a
		// fallback for any caller not yet migrated to GroundFogMaterial.
		const mat = obj.mat || {};

		// tint
		let color = mat.color || obj.fogColor || this.defaultColor;
		if (color instanceof Color3) color = color.toArray();
		this.colorUniform.set(color);

		const num = (a, b, d) => typeof a === "number" ? a : (typeof b === "number" ? b : d);
		this.opacityUniform.set(num(mat.opacity, obj.fogOpacity, 0.5));
		this.densityUniform.set(num(mat.density, obj.density, 0.55));
		this.noiseScaleUniform.set(num(mat.noiseScale, obj.noiseScale, 0.045));
		this.flow1Uniform.set(mat.flow1 || obj._flow1 || [0, 0]);
		this.flow2Uniform.set(mat.flow2 || obj._flow2 || [0, 0]);

		// translucent overlay: blend on, depth-test against the scene but don't
		// write depth so layers don't occlude each other
		gl.enable(gl.BLEND);
		gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
		gl.depthMask(false);

		// fog is a thin horizontal sheet — draw both faces so it's visible
		// whether seen from above or below
		gl.disable(gl.CULL_FACE);
	}

	endObject(obj) {
		const gl = this.gl;

		gl.depthMask(true);
		gl.disable(gl.BLEND);
		gl.enable(gl.CULL_FACE);

		super.endObject(obj);
	}
}
