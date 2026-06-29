
import { CubeMap } from '../webgl/cubemap';
import { ShaderSources } from '../shader/shadersources';
import { ScreenMesh } from './pipeline';

// Per-face basis for reconstructing world-space directions from a fullscreen
// quad rendered into a cube face. Matches the standard GL cubemap convention
// (CubeMap.getLoadingFaces order: +X, -X, +Y, -Y, +Z, -Z), so the baked map
// aligns with how the scene samples the environment.
//
//   dir = forward + right * s + up * t,  where (s, t) in [-1, 1]
// The four side faces use the nominal GL directions. The two pole faces (+Y /
// -Y) need two corrections because rendering a fullscreen quad into a cube
// *face* via an FBO is mirrored compared with how the face is later sampled,
// and that mirror lands differently on the poles than on the sides:
//   1. `forward` elevation is swapped (+Y target samples the downward
//      hemisphere, -Y the upward) — without this the poles come out swapped,
//      i.e. looking up shows the nadir and looking down shows the sky.
//   2. `up` is then negated, a single-axis (vertical) flip that undoes the
//      residual mirror so cloud detail stays continuous across the pole/side
//      seams. This makes the two pole entries intentionally left-handed
//      (right × up === -forward); that is the correction, not a bug.
const FACE_BASIS = [
	{ forward: [ 1,  0,  0], right: [ 0,  0, -1], up: [ 0, -1,  0] }, // +X
	{ forward: [-1,  0,  0], right: [ 0,  0,  1], up: [ 0, -1,  0] }, // -X
	{ forward: [ 0, -1,  0], right: [ 1,  0,  0], up: [ 0,  0, -1] }, // +Y target (samples down, mirrored)
	{ forward: [ 0,  1,  0], right: [ 1,  0,  0], up: [ 0,  0,  1] }, // -Y target (samples up, mirrored)
	{ forward: [ 0,  0,  1], right: [ 1,  0,  0], up: [ 0, -1,  0] }, // +Z
	{ forward: [ 0,  0, -1], right: [-1,  0,  0], up: [ 0, -1,  0] }, // -Z
];

// Face basis for bakes that *re-sample an existing cubemap* (irradiance,
// specular prefilter) rather than projecting a panorama / procedural sky.
//
// FACE_BASIS' two pole entries carry a hemisphere swap that is correct only for
// the equirect/atmosky direction→colour lookups (see the comment above). When
// the same swap is reused to sample a *cubemap* — whose vertical convention is
// already the opposite — the +Y/-Y faces come out inverted, so an up-facing
// surface (e.g. a ship deck) reads the dark lower hemisphere instead of the
// bright sky. The poles here use the nominal (un-swapped) directions so a
// resampled cube matches the source cube's orientation; the four side faces are
// unchanged (verified identical between the source and resampled cubes).
const CUBE_FACE_BASIS = [
	FACE_BASIS[0], // +X
	FACE_BASIS[1], // -X
	{ forward: [ 0,  1,  0], right: [ 1,  0,  0], up: [ 0,  0,  1] }, // +Y (samples up)
	{ forward: [ 0, -1,  0], right: [ 1,  0,  0], up: [ 0,  0, -1] }, // -Y (samples down)
	FACE_BASIS[4], // +Z
	FACE_BASIS[5], // -Z
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
	// reflections from coarser levels. `rotation` (radians) spins the environment
	// about the vertical axis as it is baked, so the sky and every reflection /
	// IBL term that samples this cubemap stay in sync.
	equirectToCubemap(equirectTexture, size = 1024, rotation = 0) {
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
		shader.yawUniform.set(rotation); // spin the environment about the vertical axis

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

	// Render the procedural single-scattering sky (atmosky shader) into a cubemap
	// for the given sun direction + atmosphere params. Reuses an existing target
	// when provided so the cubemap object identity is stable across re-bakes (the
	// scene's specular IBL keeps pointing at the same cube as the sun animates);
	// otherwise creates a fresh HDR, mipmapped cube. Returns the target.
	bakeProceduralSky(sunDirection, params, size = 256, target = null) {
		const gl = this.renderer.gl;

		if (!target) {
			target = new CubeMap(this.renderer);
			target.enableMipmap = true;
			target.trilinear = true;
			target.create(size, size, null, { hdr: true }); // RGBA16F faces on WebGL2
		}

		const fbo = gl.createFramebuffer();
		gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
		gl.viewport(0, 0, target.width, target.height);
		gl.disable(gl.DEPTH_TEST);

		const shader = ShaderSources.atmosky.instance;
		this.renderer.useShader(shader);
		shader.setAtmosphere(sunDirection, params);

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

		// rebuild the mip chain used for roughness-based specular sampling
		target.use();
		target.mipmappable = target.enableMipmap;
		if (target.mipmappable) {
			gl.generateMipmap(gl.TEXTURE_CUBE_MAP);
			target.mipmapped = true;
		}
		target.setParameters();
		target.disuse();

		target.loaded = true;

		return target;
	}

	// GGX-prefilter a source environment cubemap into the specular IBL map.
	//
	// Each mip level of the returned cube holds the environment convolved with
	// the GGX specular lobe for a roughness of (mip / maxMip): mip 0 is a sharp
	// mirror, the coarsest mip a fully rough blur. The standard shader then reads
	// a physically blurred reflection with textureCube(refMap, R, roughness*maxLod)
	// instead of the box-downsampled (still-sharp) mips a plain generateMipmap
	// produces — which made even moderately rough surfaces mirror the sky.
	//
	// Returns the prefiltered CubeMap; `_maxLod` is the max mip index, which the
	// renderer hands to the shader as maxEnvLod so roughness maps onto the chain.
	prefilterSpecular(envCubemap, size = 256) {
		const gl = this.renderer.gl;

		const target = new CubeMap(this.renderer);
		target.enableMipmap = true;
		target.trilinear = true;
		target.create(size, size, null, { hdr: !!envCubemap.hdr }); // RGBA16F faces on WebGL2

		// Allocate the full mip chain up front (generateMipmap fills it with a
		// box-downsample we then overwrite mip-by-mip with the GGX prefilter).
		target.use();
		target.mipmappable = target.enableMipmap;
		if (target.mipmappable) {
			gl.generateMipmap(gl.TEXTURE_CUBE_MAP);
			target.mipmapped = true;
		}
		target.setParameters(); // trilinear min filter for smooth roughness blend
		target.disuse();

		const maxMip = Math.max(0, Math.floor(Math.log2(size)));
		const srcFaceSize = (envCubemap.images && envCubemap.images[0] && envCubemap.images[0].width)
			|| envCubemap.width || size;

		const fbo = gl.createFramebuffer();
		gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
		gl.disable(gl.DEPTH_TEST);

		const shader = ShaderSources.prefilterspec.instance;
		this.renderer.useShader(shader);
		shader.envMapUniform.set(envCubemap);
		shader.resolutionUniform.set(srcFaceSize);

		const faces = target.getLoadingFaces();

		for (let mip = 0; mip <= maxMip; mip++) {
			const mipSize = Math.max(1, size >> mip);
			gl.viewport(0, 0, mipSize, mipSize);

			// mip 0 -> roughness 0 (mirror), coarsest mip -> roughness 1
			const roughness = maxMip > 0 ? mip / maxMip : 0;
			shader.roughnessUniform.set(roughness);

			for (let i = 0; i < 6; i++) {
				gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0,
					faces[i], target.glTexture, mip);

				const basis = CUBE_FACE_BASIS[i];
				shader.setFace(basis.forward, basis.right, basis.up);

				gl.clear(gl.COLOR_BUFFER_BIT);

				shader.beginMesh(this.screenMesh);
				this.screenMesh.draw(this.renderer);
				shader.endMesh();
			}
		}

		this.renderer.disuseCurrentShader();

		gl.bindFramebuffer(gl.FRAMEBUFFER, null);
		gl.deleteFramebuffer(fbo);
		gl.enable(gl.DEPTH_TEST);

		// NB: no generateMipmap here — that would overwrite the prefiltered mips.
		target.loaded = true;
		target._maxLod = maxMip;

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

			const basis = CUBE_FACE_BASIS[i];
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
