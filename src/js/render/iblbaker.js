
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

	// Project an equirectangular (lat-long) panorama texture into a cubemap.
	// Used to turn a loaded HDR environment into the cubemap the engine samples
	// for both the skybox background and specular image-based lighting. The
	// result carries a full mip chain so the standard shader can sample rougher
	// reflections from coarser levels.
	equirectToCubemap(equirectTexture, size = 1024) {
		const gl = this.renderer.gl;

		const target = new CubeMap(this.renderer);
		target.enableMipmap = true;
		target.trilinear = true;
		target.create(size, size, null, { hdr: true }); // RGBA16F faces on WebGL2

		const fbo = gl.createFramebuffer();
		gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
		gl.viewport(0, 0, size, size);
		gl.disable(gl.DEPTH_TEST);

		const shader = ShaderSources.equirect.instance;
		this.renderer.useShader(shader);
		shader.equirectMapUniform.set(equirectTexture);

		// wrap the panorama horizontally so the azimuth seam is gap-free
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

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

		// build the mip chain used for roughness-based specular sampling
		target.use();
		target.mipmappable = target.enableMipmap;
		if (target.mipmappable) {
			gl.generateMipmap(gl.TEXTURE_CUBE_MAP);
			target.mipmapped = true;
		}
		target.setParameters(); // re-apply now that mip filtering is valid
		target.disuse();

		target.loaded = true;

		return target;
	}

	// Bake a diffuse irradiance cubemap from the given source environment
	// cubemap. Returns a CubeMap usable as the diffuse ambient term in the
	// standard shader — float (RGBA16F) when the source is HDR so highlights
	// aren't clamped, otherwise RGBA8.
	bakeIrradiance(envCubemap, size = 32) {
		const gl = this.renderer.gl;

		const target = new CubeMap(this.renderer);
		target.enableMipmap = false;
		target.create(size, size, null, { hdr: !!envCubemap.hdr }); // 6 faces, LINEAR / clamp

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
