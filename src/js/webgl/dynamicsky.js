
import { Vec3 } from "@/math";
import { SkyBox } from './cubemap';
import { IBLBaker } from '../render/iblbaker';

// A skybox whose environment is generated procedurally instead of loaded from
// images or an HDR panorama. A compact single-scattering (Rayleigh + Mie)
// atmosphere is ray-marched into an HDR cubemap (atmosky shader) for the current
// sun direction; that cubemap then drives the skybox background and image-based
// lighting exactly like any other SkyBox. Move the sun and the sky, its
// reflections, and the ambient light all follow.
//
//   const sky = new DynamicSky(renderer, {
//     faceSize: 256,
//     light: scene.sun,          // optional: keep the sun light aligned + tinted
//   });
//   scene.skybox = sky;
//   sky.setSunElevationAzimuth(8, 140);   // low golden-hour sun
//
// The renderer calls update() each frame; it re-bakes only when the sun (or a
// parameter) changed, so a static sky costs one bake and an animated time-of-day
// re-bakes once per change. Requires WebGL2 for HDR cube faces; on WebGL1 it
// falls back to LDR-clamped faces like the other skyboxes.
export class DynamicSky extends SkyBox {
	constructor(renderer, options = {}) {
		super(renderer, null, options.size || 500);

		// resolution of each baked cube face. 256 keeps re-bakes cheap for animated
		// skies; raise for sharper specular reflections of a static sky.
		this.faceSize = options.faceSize || 256;

		// atmosphere tunables — defaults model Earth at sea level (wwwtyro-style
		// coefficients). All distances are in metres, internal to the sky march and
		// independent of the scene's unit scale.
		this.params = {
			sunIntensity: numberOr(options.sunIntensity, 22.0),
			rayleighCoeff: options.rayleighCoeff || new Vec3(5.5e-6, 13.0e-6, 22.4e-6),
			mieCoeff: numberOr(options.mieCoeff, 21e-6),
			rayleighScale: numberOr(options.rayleighScale, 8000),
			mieScale: numberOr(options.mieScale, 1200),
			mieG: numberOr(options.mieG, 0.758),
			planetRadius: numberOr(options.planetRadius, 6371000),
			atmosphereRadius: numberOr(options.atmosphereRadius, 6471000),
			groundAlbedo: options.groundAlbedo || new Vec3(0.25, 0.24, 0.22),
		};

		// direction TO the sun (world space, +Y up). Default: a mid-morning sun.
		this.sunDirection = Vec3.normalize(options.sunDirection || new Vec3(0.0, 0.35, 1.0));

		// optional directional light (e.g. scene.sun) kept aligned with the sky's
		// sun and tinted by a cheap atmospheric-extinction approximation, so the
		// scene lighting stays coherent with the sky.
		this.light = options.light || null;
		this.sunLightIntensity = numberOr(options.sunLightIntensity, 1.0);

		this._baker = new IBLBaker(renderer);
		this.cubemap = null;
		this.loaded = false;
		this._dirty = true;
		this._inited = false;

		this.bake();
	}

	// Set the sun direction directly (points toward the sun; normalized for you).
	setSunDirection(x, y, z) {
		this.sunDirection = Vec3.normalize(new Vec3(x, y, z));
		this._dirty = true;
	}

	// Set the sun by elevation (degrees above the horizon) and azimuth (degrees,
	// 0 = +Z, increasing toward +X). Convenient for time-of-day animation.
	setSunElevationAzimuth(elevationDeg, azimuthDeg) {
		const e = elevationDeg * Math.PI / 180;
		const a = azimuthDeg * Math.PI / 180;
		const r = Math.cos(e);
		this.setSunDirection(r * Math.sin(a), Math.sin(e), r * Math.cos(a));
	}

	// Re-bake only if something changed; called by the renderer each frame.
	update() {
		if (this._dirty) this.bake();
	}

	// Render the sky cubemap for the current sun + params and refresh dependents.
	bake() {
		this.cubemap = this._baker.bakeProceduralSky(
			this.sunDirection, this.params, this.faceSize, this.cubemap);
		this.loaded = true;
		this._dirty = false;

		if (this.light) this._applySunLight();

		// Invalidate the scene's baked diffuse irradiance so it re-bakes from the
		// new sky. Specular reflections sample the cube directly, so they update
		// for free without a re-bake.
		const scene = this.renderer && this.renderer.currentScene;
		if (scene) {
			scene._iblBakedFor = null;
			if (scene.requireUpdateFrame) scene.requireUpdateFrame();
		}

		if (!this._inited) {
			this._inited = true;
			this.initFinished(); // wires the cubemap into the background cube + fires load
		}
	}

	// Keep an attached directional light pointed at the sky's sun and tint it by a
	// simple elevation-driven extinction model (white high up → warm at the
	// horizon → dark below it).
	_applySunLight() {
		const d = this.sunDirection;
		if (this.light.location && this.light.location.set) {
			this.light.location.set(d.x * 100, d.y * 100, d.z * 100);
		}

		const sinH = d.y;
		const day = smoothstep(-0.06, 0.12, sinH);      // 0 at night, 1 in daylight
		const low = 1.0 - smoothstep(0.0, 0.35, sinH);  // 1 near horizon, 0 high up

		// blend a neutral daylight white toward a warm sunset tint as the sun lowers
		const r = (1.0 + (1.00 - 1.0) * low) * day * this.sunLightIntensity;
		const g = (0.98 + (0.55 - 0.98) * low) * day * this.sunLightIntensity;
		const b = (0.95 + (0.28 - 0.95) * low) * day * this.sunLightIntensity;

		if (!this.light.mat) this.light.mat = {};
		this.light.mat.color = [r, g, b];
	}
}

function numberOr(value, fallback) {
	return (typeof value === "number") ? value : fallback;
}

function smoothstep(edge0, edge1, x) {
	const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
	return t * t * (3 - 2 * t);
}
