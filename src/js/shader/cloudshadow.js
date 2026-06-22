
import { Shader } from '../webgl/shader.js';

// Renders a cloud's cast shadow as a soft, fbm-textured dark blob on a flat
// quad (a PlaneMesh) lying on the ground. One quad per cloud cluster, drifting
// with the wind. Selected per-object via `obj.shader = { name: "cloudshadow" }`
// (see the Clouds effect, groundShadow option). Per-object fields:
//   obj.shadowOpacity  overall strength (cluster edge-fade * layer fade-in)
//   obj.shadowColor    dark tint laid over the ground
//   obj.shadowSeed     per-cluster seed so neighbouring shadows differ
export class CloudShadowShader extends Shader {
	constructor(renderer, vertShaderSrc, fragShaderSrc) {
		super(renderer, vertShaderSrc, fragShaderSrc);

		this.use();

		this.vertexPositionAttribute = this.findAttribute("vertexPosition");

		this.projectViewModelMatrixUniform = this.bindUniform("projectViewModelMatrix", "mat4");
		this.opacityUniform = this.bindUniform("opacity", "float");
		this.shadowColorUniform = this.bindUniform("shadowColor", "vec3");
		this.seedUniform = this.bindUniform("seed", "float");
	}

	beginObject(obj) {
		super.beginObject(obj);

		const gl = this.gl;

		this.projectViewModelMatrixUniform.set(obj._transform.mul(this.renderer.projectionViewMatrix));
		this.opacityUniform.set(typeof obj.shadowOpacity === "number" ? obj.shadowOpacity : 0.3);
		this.shadowColorUniform.set(obj.shadowColor || [0.05, 0.06, 0.08]);
		this.seedUniform.set(typeof obj.shadowSeed === "number" ? obj.shadowSeed : 0.0);

		// alpha blend over the ground; depth test on (terrain occludes it) but no
		// depth write so overlapping shadow quads simply deepen
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
