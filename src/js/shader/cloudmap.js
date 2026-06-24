
import { Shader } from '../webgl/shader.js';

// Renders the cloud field from the sun's orthographic viewpoint, accumulating
// per-puff optical density into a transmittance map (see cloudmap.frag). Driven
// directly by the CloudVolumetricLight effect, which sets `lightViewProj`,
// `worldToPx`, `puffScale` and `puffDensity` on the instance each frame before
// drawing the cloud particle mesh.
export class CloudMapShader extends Shader {
	constructor(renderer, vertShaderSrc, fragShaderSrc) {
		super(renderer, vertShaderSrc, fragShaderSrc);

		this.use();

		this.vertexPositionAttribute = this.findAttribute("vertexPosition");
		this.vertexSizeAttribute = this.findAttribute("vertexSize");

		this.projUniform = this.bindUniform("projectViewModelMatrix", "mat4");
		this.opacityUniform = this.bindUniform("opacity", "float");
		this.worldToPxUniform = this.bindUniform("worldToPx", "float");
		this.puffScaleUniform = this.bindUniform("puffScale", "float");
		this.puffDensityUniform = this.bindUniform("puffDensity", "float");
		this.fadeHalfUniform = this.bindUniform("fadeHalf", "vec2");
		this.fadeMarginUniform = this.bindUniform("fadeMargin", "float");

		// set per-frame by the effect
		this.lightViewProj = null;
		this.worldToPx = 1;
		this.puffScale = 1;
		this.puffDensity = 1;
	}

	beginObject(obj) {
		super.beginObject(obj);

		this.projUniform.set(obj._transform.mul(this.lightViewProj));
		this.opacityUniform.set(typeof obj.cloudOpacity === "number" ? obj.cloudOpacity : 0.85);
		this.worldToPxUniform.set(this.worldToPx);
		this.puffScaleUniform.set(this.puffScale);
		this.puffDensityUniform.set(this.puffDensity);
		this.fadeHalfUniform.set([
			typeof obj.halfW === "number" ? obj.halfW : 1e9,
			typeof obj.halfD === "number" ? obj.halfD : 1e9,
		]);
		this.fadeMarginUniform.set(typeof obj.fadeMargin === "number" ? obj.fadeMargin : 0.0);
	}
}
