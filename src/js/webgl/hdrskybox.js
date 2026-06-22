
import { SkyBox } from './cubemap';
import { Texture } from './texture';
import { IBLBaker } from '../render/iblbaker';
import { loadHDR, decodeRGBE } from '../utility/hdrloader';

// A skybox built from a single equirectangular HDR (.hdr / Radiance RGBE)
// panorama instead of six cube-face images. The panorama is decoded to linear
// float, uploaded to an RGBA16F texture, and projected into a (mipmapped) HDR
// cubemap. That cubemap then drives both the skybox background and — with the
// renderer's `enableEnvmap` option — runtime image-based lighting (diffuse
// irradiance + specular reflections) exactly like a regular SkyBox.
//
//   const sky = new HDRSkyBox(renderer, "/textures/hdr/env.hdr", { faceSize: 1024 });
//   scene.skybox = sky;
//
// On WebGL2 the pipeline is fully HDR; on WebGL1 (no float render targets) it
// gracefully falls back to LDR-clamped cube faces.
export class HDRSkyBox extends SkyBox {
	constructor(renderer, hdrUrl, options) {
		// Pass null image URLs so the six-image loader in ImageCubeBox is skipped;
		// we build the cubemap ourselves from the HDR panorama instead.
		const opts = options || {};
		super(renderer, null, opts.size || 500);

		// resolution of each baked cube face. 1024 is a good default for sharp
		// reflections from a 2K–4K source panorama.
		this.faceSize = opts.faceSize || 1024;
		this.loaded = false;

		if (typeof hdrUrl === "string") {
			this.loadFromURL(hdrUrl);
		}
	}

	loadFromURL(url) {
		loadHDR(url)
			.then(hdr => this.setFromHDRData(hdr))
			.catch(err => console.error("HDRSkyBox: failed to load " + url + " — " + (err && err.message || err)));
	}

	// Build the cubemap from an already-decoded HDR buffer
	// ({ width, height, data: Float32Array RGBA }).
	setFromHDRData(hdr) {
		const equirect = Texture.createFloat(this.renderer, hdr.width, hdr.height, hdr.data);

		const baker = new IBLBaker(this.renderer);
		this.cubemap = baker.equirectToCubemap(equirect, this.faceSize);
		baker.destroy();

		// the source panorama is no longer needed once projected into the cube
		equirect.destroy();

		this.initFinished();
	}

	// Build directly from a raw .hdr byte buffer (e.g. loaded from an archive).
	setFromHDRBuffer(buffer) {
		this.setFromHDRData(decodeRGBE(buffer));
	}
}
