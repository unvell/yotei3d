
import { ScreenMesh } from "../render/pipeline";

// Volume3D — a read/WRITE 3D texture for GPU simulation.
//
// The volumetric-cloud effect bakes a 3D noise texture once on the CPU and only
// ever *samples* it. A fluid simulation is different: its state (velocity,
// density, pressure, …) lives in 3D textures that must be UPDATED every frame,
// entirely on the GPU. WebGL2 has no compute shaders and no geometry shaders,
// so the way we write into a 3D texture is:
//
//   for each Z-slice z of the volume:
//       gl.framebufferTextureLayer(FRAMEBUFFER, COLOR_ATTACHMENT0, tex, 0, z)
//       draw a full-screen quad with a fragment shader
//
// i.e. we treat each Z-slice as an ordinary 2D render target and run a
// fragment-shader "kernel" over it. The shader reconstructs the cell's 3D
// position from gl_FragCoord.xy (the slice) plus a per-slice `layer` uniform
// (the W coordinate). Volume3DTarget below drives that per-slice loop.
//
// Storage is RGBA16F: it is color-renderable AND linearly filterable in WebGL2
// when EXT_color_buffer_float is present (the renderer exposes that as
// `extHDR`). Linear filtering is not optional here — semi-Lagrangian advection
// samples the volume at fractional cell positions on every step.
export class Volume3D {
	constructor(renderer, width, height, depth, options = {}) {
		this.renderer = renderer;
		this.gl = renderer.gl;
		this.width = width;
		this.height = height;
		this.depth = depth;

		const gl = this.gl;

		// RGBA16F by default; callers can override for single-channel fields
		// (e.g. R16F pressure) to save bandwidth.
		this.internalFormat = options.internalFormat || gl.RGBA16F;
		this.format = options.format || gl.RGBA;
		this.type = options.type || gl.HALF_FLOAT;
		const filter = options.filter || gl.LINEAR;
		// CLAMP_TO_EDGE: outside the box, advection / sampling should see the
		// border value, never wrap around to the far side of the domain.
		const wrap = options.wrap || gl.CLAMP_TO_EDGE;

		this.glTexture = gl.createTexture();
		gl.bindTexture(gl.TEXTURE_3D, this.glTexture);
		gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
		gl.texImage3D(gl.TEXTURE_3D, 0, this.internalFormat,
			width, height, depth, 0, this.format, this.type, null);
		gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, filter);
		gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, filter);
		gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_S, wrap);
		gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_T, wrap);
		gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_R, wrap);
		gl.bindTexture(gl.TEXTURE_3D, null);
	}

	// Bind this volume for READING as a sampler3D on texture unit `unit`, and
	// return `unit` so the caller can pass it straight to gl.uniform1i.
	bindSampler(unit) {
		const gl = this.gl;
		gl.activeTexture(gl.TEXTURE0 + unit);
		gl.bindTexture(gl.TEXTURE_3D, this.glTexture);
		return unit;
	}

	destroy() {
		if (this.glTexture) {
			this.gl.deleteTexture(this.glTexture);
			this.glTexture = null;
		}
	}
}

// PingPongVolume — two Volume3D buffers you alternate between. Almost every
// simulation pass reads the "current" state and writes the "next" one, then
// swaps; you can never read and write the same texture in one draw. `.read` is
// the source to sample, `.write` is the slab to render into; call `.swap()`
// once the pass is done.
export class PingPongVolume {
	constructor(renderer, width, height, depth, options = {}) {
		this.a = new Volume3D(renderer, width, height, depth, options);
		this.b = new Volume3D(renderer, width, height, depth, options);
		this.width = width;
		this.height = height;
		this.depth = depth;
	}

	get read() { return this.a; }
	get write() { return this.b; }

	swap() {
		const t = this.a;
		this.a = this.b;
		this.b = t;
	}

	destroy() {
		this.a.destroy();
		this.b.destroy();
	}
}

// Volume3DTarget — drives the per-slice render loop that writes into a Volume3D.
//
// It owns a single framebuffer object (the color attachment is re-pointed at a
// different Z-slice each iteration) and a single full-screen quad. One instance
// can be reused to render into any Volume3D of any size.
export class Volume3DTarget {
	constructor(renderer) {
		this.renderer = renderer;
		this.gl = renderer.gl;
		this.framebuffer = this.gl.createFramebuffer();
		this.quad = new ScreenMesh();
	}

	// Bind the framebuffer and configure GL for off-screen volume writes:
	// viewport = one slice, no depth, no blend (each kernel fully overwrites
	// its slice). The owning effect restores global GL state once, after all
	// of its passes, the same way VolumetricClouds does.
	begin(volume) {
		const gl = this.gl;
		gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffer);
		gl.viewport(0, 0, volume.width, volume.height);
		gl.disable(gl.DEPTH_TEST);
		gl.depthMask(false);
		gl.disable(gl.BLEND);
	}

	// Point COLOR_ATTACHMENT0 at slice `z` of `volume`.
	setLayer(volume, z) {
		const gl = this.gl;
		gl.framebufferTextureLayer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, volume.glTexture, 0, z);
	}

	// Run the currently-bound shader over EVERY Z-slice of `volume`, writing the
	// shader's output into that slice. `onSlice(z, wNorm)` is invoked just
	// before each slice's draw so the caller can set the per-slice uniform
	// (wNorm = the normalized W coordinate of the slice's cell centers, in
	// (0,1)). The shader must already be active (renderer.useShader(...)).
	renderAllSlices(volume, shader, onSlice) {
		const gl = this.gl;
		this.begin(volume);
		shader.beginMesh(this.quad);
		for (let z = 0; z < volume.depth; z++) {
			this.setLayer(volume, z);
			if (onSlice) onSlice(z, (z + 0.5) / volume.depth);
			this.quad.draw(this.renderer);
		}
		shader.endMesh(this.quad);
	}

	// Read one Z-slice back to the CPU as a Float32Array (length W*H*4). For
	// debugging / verifying a volume; not used on the hot path.
	readSlice(volume, z) {
		const gl = this.gl;
		gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffer);
		this.setLayer(volume, z);
		const out = new Float32Array(volume.width * volume.height * 4);
		const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
		if (status === gl.FRAMEBUFFER_COMPLETE) {
			gl.readPixels(0, 0, volume.width, volume.height, gl.RGBA, gl.FLOAT, out);
		} else {
			console.warn("Volume3DTarget.readSlice: framebuffer incomplete 0x" + status.toString(16));
		}
		gl.bindFramebuffer(gl.FRAMEBUFFER, null);
		return out;
	}

	unbind() {
		this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, null);
	}

	destroy() {
		if (this.framebuffer) {
			this.gl.deleteFramebuffer(this.framebuffer);
			this.framebuffer = null;
		}
		if (this.quad) {
			this.quad.destroy();
			this.quad = null;
		}
	}
}
