
import { CubeMap } from '../webgl/cubemap';
import { ShaderSources } from '../shader/shadersources';
import { ScreenMesh } from './pipeline';

// Per-face basis for reconstructing world-space directions from a fullscreen
// quad rendered into a cube face. Matches the standard GL cubemap convention
// (CubeMap.getLoadingFaces order: +X, -X, +Y, -Y, +Z, -Z), so the baked map
// aligns with how the scene samples the environment.
//
//   dir = forward + right * s + up * t,  where (s, t) in [-1, 1]
const FACE_BASIS = [
	{ forward: [ 1,  0,  0], right: [ 0,  0, -1], up: [ 0, -1,  0] }, // +X
	{ forward: [-1,  0,  0], right: [ 0,  0,  1], up: [ 0, -1,  0] }, // -X
	{ forward: [ 0,  1,  0], right: [ 1,  0,  0], up: [ 0,  0,  1] }, // +Y
	{ forward: [ 0, -1,  0], right: [ 1,  0,  0], up: [ 0,  0, -1] }, // -Y
	{ forward: [ 0,  0,  1], right: [ 1,  0,  0], up: [ 0, -1,  0] }, // +Z
	{ forward: [ 0,  0, -1], right: [-1,  0,  0], up: [ 0, -1,  0] }, // -Z
];

export class IBLBaker {
	constructor(renderer) {
		this.renderer = renderer;
		this.screenMesh = new ScreenMesh();
	}

	// Bake a diffuse irradiance cubemap from the given source environment
	// cubemap. Returns a CubeMap (LDR, RGBA8) usable as the diffuse ambient
	// term in the standard shader.
	bakeIrradiance(envCubemap, size = 32) {
		const gl = this.renderer.gl;

		const target = new CubeMap(this.renderer);
		target.enableMipmap = false;
		target.create(size, size); // allocates 6 RGBA8 faces, LINEAR / clamp

		const fbo = gl.createFramebuffer();
		gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
		gl.viewport(0, 0, size, size);
		gl.disable(gl.DEPTH_TEST);

		const shader = ShaderSources.irradiance.instance;
		this.renderer.useShader(shader);
		shader.envMapUniform.set(envCubemap);

		const faces = target.getLoadingFaces();

		for (let i = 0; i < 6; i++) {
			gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0,
				faces[i], target.glTexture, 0);

			const basis = FACE_BASIS[i];
			shader.setFace(basis.forward, basis.right, basis.up);

			gl.clear(gl.COLOR_BUFFER_BIT);

			shader.beginMesh(this.screenMesh);
			this.screenMesh.draw(this.renderer);
			shader.endMesh();
		}

		this.renderer.disuseCurrentShader();

		gl.bindFramebuffer(gl.FRAMEBUFFER, null);
		gl.deleteFramebuffer(fbo);
		gl.enable(gl.DEPTH_TEST);

		target.loaded = true;

		return target;
	}

	destroy() {
		if (this.screenMesh) {
			this.screenMesh.destroy();
			this.screenMesh = null;
		}
	}
}
