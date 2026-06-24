
import { Shader } from '../webgl/shader.js';

// Composites the pre-rendered (half-res, premultiplied) cloud buffer over the
// scene. Drawn as the last scene object at the far plane; depth test is disabled
// (the clouds are sky, and this avoids z-fighting the skybox cube, exactly like
// the cloud god-ray pass). The VolumetricClouds effect sets `cloudTex` per frame.
export class VolumetricCloudCompositeShader extends Shader {
	constructor(renderer, vertShaderSrc, fragShaderSrc) {
		super(renderer, vertShaderSrc, fragShaderSrc);

		this.use();

		this.vertexPositionAttribute = this.findAttribute("vertexPosition");
		this.cloudTexUniform = this.bindUniform("cloudTex", "tex", 0);

		this.cloudTexture = null;
	}

	beginObject(obj) {
		super.beginObject(obj);

		const gl = this.gl;

		this.cloudTexUniform.set(this.cloudTexture || Shader.emptyTexture);

		// premultiplied-alpha compositing: out = cloud.rgb + (1 - cloud.a) * scene
		gl.enable(gl.BLEND);
		gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
		gl.disable(gl.DEPTH_TEST);
		gl.depthMask(false);
	}

	endObject(obj) {
		const gl = this.gl;

		gl.enable(gl.DEPTH_TEST);
		gl.depthMask(true);
		gl.disable(gl.BLEND);
		gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE_MINUS_DST_ALPHA, gl.ONE);

		this.cloudTexUniform.unset();

		super.endObject(obj);
	}
}
