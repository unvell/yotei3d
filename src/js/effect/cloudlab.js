
import { Volume3D, Volume3DTarget } from "../webgl/volume3d.js";
import { ScreenMesh } from "../render/pipeline";
import { SceneObject } from "../scene/object";
import { ShaderSources } from "../shader/shadersources";

// CloudLab — a minimal, learning-oriented volumetric cloud sandbox.
//
// Phase 1: YOU write the density field (cloudlab_gen.frag → density()). CloudLab
// bakes it into a 3D texture once, slice by slice, ENTIRELY on the GPU (no CPU
// noise), then a Beer's-law raymarch viewer (cloudlab_view.frag) renders that
// volume as a full-screen background every frame. No lighting yet — just
// density → transmittance, so the shape of your density() is what you see.
//
//   const lab = new CloudLab(scene, { resolution: 96, sigma: 40, coverage: 0.5 });
//   // tweak lab.coverage / lab.scale / lab.time, then:
//   lab.rebake();        // re-runs the GPU bake and redraws
//
// Bake-time tunables (uniforms for density()):  coverage, scale, time.
// View tunables (no rebake needed):  sigma, steps, colorBase/Top, sky*.
//
// Requires WebGL2 (3D textures). The density volume is RGBA8 (density in .r) —
// color-renderable AND linearly filterable on any WebGL2, so no float extension
// is needed. Switch internalFormat to RGBA16F later if you want HDR density.
export class CloudLab {
	constructor(scene, options = {}) {
		this.scene = scene;
		this.renderer = scene.renderer;
		const r = this.renderer, gl = r.gl;

		if (!r.isWebGL2) {
			console.warn("CloudLab requires WebGL2 (3D textures / GLSL ES 3.00); disabled.");
			this._supported = false;
			return;
		}
		this._supported = true;

		// --- density volume (the 3D texture you bake into) ---
		this.resolution = options.resolution || 96;
		this.volume = new Volume3D(r, this.resolution, this.resolution, this.resolution, {
			internalFormat: gl.RGBA8, format: gl.RGBA, type: gl.UNSIGNED_BYTE,
			filter: gl.LINEAR, wrap: gl.CLAMP_TO_EDGE,
		});
		this._target = new Volume3DTarget(r);

		// Optional SceneObject whose rotation is applied to the cloud (so you can
		// spin the volume and inspect how it's filled in 3D). The viewer marches
		// in this object's local frame via the inverse of its rotation matrix.
		this.transformObject = options.transformObject || null;

		// --- world-space box the volume maps onto (cell [0,1]^3 -> this AABB) ---
		const s = numberOr(options.size, 2.0);
		const c = options.center || [0, 0, 0];
		const cx = c[0] !== undefined ? c[0] : 0, cy = c[1] !== undefined ? c[1] : 0, cz = c[2] !== undefined ? c[2] : 0;
		this.boxMin = [cx - s * 0.5, cy - s * 0.5, cz - s * 0.5];
		this.boxMax = [cx + s * 0.5, cy + s * 0.5, cz + s * 0.5];

		// --- bake-time tunables (passed to cloudlab_gen.frag's density()) ---
		this.coverage = numberOr(options.coverage, 0.5);
		this.scale = numberOr(options.scale, 1.0);
		this.time = numberOr(options.time, 0.0);

		// --- view tunables (used by cloudlab_view.frag; no rebake needed) ---
		this.sigma = numberOr(options.sigma, 40.0);   // density -> extinction scale (濃さ)
		this.steps = options.steps || 96;
		// sun (world-space direction TOWARD the sun) + its radiance. Default ≈ 40°
		// elevation, 35° azimuth. The example drives this from elevation/azimuth.
		this.sunDir = options.sunDir || [0.44, 0.64, 0.63];
		this.sunColor = options.sunColor || [1.0, 0.96, 0.9];
		this.colorBase = options.colorBase || [0.62, 0.66, 0.74];
		this.colorTop = options.colorTop || [1.0, 1.0, 1.0];
		this.skyTop = options.skyTop || [0.30, 0.50, 0.82];
		this.skyBottom = options.skyBottom || [0.80, 0.86, 0.92];

		// --- bake the density field once, now (self-contained off-screen pass) ---
		this._bake();

		// --- full-screen viewer object, drawn by the scene each frame ---
		const obj = new SceneObject();
		obj.addMesh(new ScreenMesh());
		obj.shader = { name: "cloudlab_view" };
		obj._cloudlab = this;
		obj.castShadow = false;
		obj.receiveShadow = false;
		obj.receiveLight = false;
		obj.getBounds = () => null;   // never pollute shadow / fit bounds
		this._viewObj = obj;
		scene.add(obj);
	}

	// Re-run the density bake. Call after changing coverage / scale / time, or
	// after editing density() (a hot-reload re-constructs CloudLab, which bakes
	// in the constructor — this is for runtime parameter tweaks). Cheap: it's a
	// one-time GPU pass over the volume.
	rebake() {
		if (!this._supported) return this;
		this._bake();
		this.scene.requireUpdateFrame();
		return this;
	}

	// Run cloudlab_gen over every Z-slice, writing density() into the volume.
	_bake() {
		const r = this.renderer;
		const shader = ShaderSources.cloudlab_gen.instance;
		if (!shader) return;

		r.useShader(shader);
		shader.setParams(this);
		this._target.renderAllSlices(this.volume, shader, (z, wNorm) => shader.setLayer(wNorm));
		this._target.unbind();

		// renderAllSlices bound its own framebuffer and shrank the viewport to one
		// slice; restore the default target + full-size viewport for the scene.
		if (r.setViewportToPhysicalRenderSize) r.setViewportToPhysicalRenderSize();
	}

	dispose() {
		const r = this.renderer;
		if (this._viewObj) {
			this.scene.remove(this._viewObj);
			this._viewObj = null;
		}
		if (this._target) {
			this._target.destroy();
			this._target = null;
		}
		if (this.volume) {
			this.volume.destroy();
			this.volume = null;
		}
	}
}

function numberOr(value, fallback) {
	return (typeof value === "number") ? value : fallback;
}
