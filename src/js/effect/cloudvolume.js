
import { Vec3, Matrix4 } from "@/math";
import { FrameBuffer } from "../webgl/buffers";
import { ScreenMesh } from "../render/pipeline";
import { SceneObject } from "../scene/object";
import { ShaderSources } from "../shader/shadersources";

// CloudVolumetricLight — physically-motivated god rays + dappled ground shadows
// driven by a sun's-eye-view cloud transmittance map (a "cloud shadow map").
//
// Unlike the screen-space VolumetricLight (a 2D radial-blur overlay that smears
// the on-screen sun), this works in world space:
//
//   1. Each frame, a PRE-PASS renders the cloud puffs from the sun's
//      orthographic viewpoint into a floating-point map, accumulating optical
//      density (cloudmap shader). The map is the real, lumpy cloud silhouette as
//      the sun sees it — not a stack of circles.
//   2. The standard shader projects that map onto the scene, attenuating the sun
//      term so the ground (and any geometry) is dappled with cloud-shaped light
//      and shadow that tracks the drifting clouds.
//   3. A full-screen ray-march (cloudgodray shader, drawn last in the scene
//      pass, additively, confined to sky pixels by the depth test) integrates
//      in-scattered sunlight along each view ray using the same map, producing
//      true volumetric shafts that break through the cloud gaps. The result is
//      additive HDR light, so it blooms and tonemaps with the rest of the scene.
//
//   const clouds = new Clouds({ ... });
//   scene.add(clouds);
//   const rays = new CloudVolumetricLight(scene, {
//     clouds,                    // the Clouds effect to occlude the sun
//     follow: scene.sun,         // sun direction (tracks live)
//     density: 7,                // optical density: shadow/shaft contrast
//     groundIntensity: 0.85,     // strength of the dappling on the ground
//     intensity: 1.0,            // shaft brightness
//   });
//
// Requires WebGL2 (uses a float render target for the density map). Call
// dispose() to remove it.
export class CloudVolumetricLight {
	constructor(scene, options = {}) {
		this.scene = scene;
		this.renderer = scene.renderer;
		this.enabled = options.enabled !== false;

		// the Clouds object (or any ParticleObject with cloud puff meshes) that
		// occludes the sun. Without it there is nothing to cast the shadow.
		this.clouds = options.clouds || null;

		// sun direction source (read every frame). Defaults to the scene sun.
		this._follow = options.follow || scene.sun || null;

		// --- cloud shadow map -------------------------------------------------
		this.resolution = options.resolution || 1024;
		// optical-density scale: transmittance = exp(-density * tau). Higher =
		// deeper, higher-contrast shadows and shafts.
		this.density = (typeof options.density === "number") ? options.density : 0.15;
		// how strongly the projected shadow darkens the ground's sun term (0..1)
		this.groundIntensity = (typeof options.groundIntensity === "number") ? options.groundIntensity : 0.85;
		// calibrates each puff's shadow footprint to its on-screen size
		this.puffScale = (typeof options.puffScale === "number") ? options.puffScale : 2.2;
		// optical density contributed per unit puff opacity
		this.puffDensity = (typeof options.puffDensity === "number") ? options.puffDensity : 1.0;
		// margin multiplier on the light frustum around the cloud volume
		this.boundScale = (typeof options.boundScale === "number") ? options.boundScale : 1.15;

		// --- volumetric shafts ------------------------------------------------
		this.color = options.color || [1.0, 0.92, 0.80];
		this.intensity = (typeof options.intensity === "number") ? options.intensity : 1.0;
		this.steps = options.steps || 64;
		this.maxDist = (typeof options.maxDist === "number") ? options.maxDist : 1400;
		this.phaseG = (typeof options.phaseG === "number") ? options.phaseG : 0.76;
		this.scatter = (typeof options.scatter === "number") ? options.scatter : 1.0;
		this.startJitter = (typeof options.startJitter === "number") ? options.startJitter : 1.0;

		// vertical half-thickness of the cloud layer: the shafts only shadow air
		// below it (auto-derived from the cloud options when not given).
		this.cloudBand = (typeof options.cloudBand === "number") ? options.cloudBand : null;

		this.shaftsEnabled = options.shafts !== false;
		this.groundShadowEnabled = options.groundShadow !== false;

		this.lightViewProj = new Matrix4();
		this._worldToPx = 1;

		// floating-point density map (RGBA16F when supported). depthBuffer off and
		// clearBackground off — the pre-pass clears it to zero itself.
		const r = this.renderer;
		this.fbo = new FrameBuffer(r, this.resolution, this.resolution, {
			depthBuffer: false,
			clearBackground: false,
			float: r.extHDR,
		});

		// run the cloud-shadow pre-pass each frame, before the main pipeline
		this._prePass = () => this._renderShadowMap();
		r.prePasses.push(this._prePass);

		// full-screen additive shaft pass, drawn as the last scene object
		if (this.shaftsEnabled) {
			const obj = new SceneObject();
			obj.addMesh(new ScreenMesh());
			obj.shader = { name: "cloudgodray" };
			obj.castShadow = false;
			obj.receiveShadow = false;
			obj.receiveLight = false;
			obj.getBounds = () => null;   // never pollute shadow / fit bounds
			this._godrayObj = obj;
			scene.add(obj);
		}
	}

	setFollow(target) { this._follow = target || null; return this; }
	setClouds(clouds) { this.clouds = clouds || null; return this; }

	// Unit direction toward the sun (world space), from the follow target.
	_sunDir() {
		const f = this._follow;
		if (f) {
			const d = f.direction || f.worldLocation || f.location;
			if (d) {
				const x = d.x !== undefined ? d.x : d[0];
				const y = d.y !== undefined ? d.y : d[1];
				const z = d.z !== undefined ? d.z : d[2];
				const len = Math.hypot(x, y, z) || 1;
				return new Vec3(x / len, y / len, z / len);
			}
		}
		return new Vec3(0, 1, 0);
	}

	// Fit the orthographic sun camera to the cloud volume each frame, so the
	// whole drifting field maps into the map regardless of sun angle.
	_updateLightMatrix() {
		const clouds = this.clouds;

		let cx = 0, cy = 300, cz = 0, ext = 1000;
		if (clouds) {
			const loc = clouds.location || { x: 0, y: 0, z: 0 };
			const o = clouds.options || {};
			cx = loc.x; cz = loc.z;
			cy = loc.y + (typeof o.height === "number" ? o.height : 60);
			const halfW = (typeof clouds.halfW === "number") ? clouds.halfW : ((o.width || 600) * 0.5);
			const halfD = (typeof clouds.halfD === "number") ? clouds.halfD : ((o.depth || 600) * 0.5);
			ext = Math.max(halfW, halfD) * this.boundScale;
		}

		const center = new Vec3(cx, cy, cz);
		const dir = this._sunDir();
		const dist = ext * 2.0;
		const eye = new Vec3(cx + dir.x * dist, cy + dir.y * dist, cz + dir.z * dist);
		const up = Math.abs(dir.y) > 0.99 ? new Vec3(0, 0, 1) : new Vec3(0, 1, 0);

		const view = new Matrix4().lookAt(eye, center, up).translate(-eye.x, -eye.y, -eye.z);
		const proj = new Matrix4();
		const range = dist + ext * 2.0;
		proj.ortho(-ext, ext, -ext, ext, -range, range);

		this.lightViewProj = view.mul(proj);
		this._worldToPx = this.resolution / (2.0 * ext);
	}

	// Pre-pass: render the cloud puffs from the sun's POV into the density map,
	// then publish it (and the light matrix) to the standard + godray shaders.
	_renderShadowMap() {
		const clouds = this.clouds;

		// Without a live cloud field there is no occluder to cast shadows or carve
		// shafts. Leave the scene completely untouched: hide the shaft pass (so it
		// can't ray-march a stale / empty map into garbage) and clear the ground
		// dappling. This is also the guard for clouds that haven't faded in yet.
		const active = this.enabled && clouds && clouds.visible !== false
			&& (typeof clouds.cloudOpacity !== "number" || clouds.cloudOpacity > 0.001);

		if (!active) {
			if (this._godrayObj) this._godrayObj.visible = false;
			const std0 = ShaderSources.standard.instance;
			if (std0) std0._cloudShadowMap = undefined;
			return;
		}

		if (this._godrayObj) this._godrayObj.visible = this.shaftsEnabled;

		const r = this.renderer, gl = r.gl;

		this._updateLightMatrix();

		const shader = ShaderSources.cloudmap.instance;
		shader.lightViewProj = this.lightViewProj;
		shader.worldToPx = this._worldToPx;
		shader.puffScale = this.puffScale;
		shader.puffDensity = this.puffDensity;

		gl.clearColor(0, 0, 0, 0);
		this.fbo.use();

		gl.disable(gl.DEPTH_TEST);
		gl.depthMask(false);
		gl.enable(gl.BLEND);
		gl.blendFunc(gl.ONE, gl.ONE);   // accumulate optical density

		r.useShader(shader);
		shader.beginObject(clouds);
		for (const mesh of clouds.meshes) {
			if (!mesh) continue;
			shader.beginMesh(mesh);
			mesh.draw(r);
			shader.endMesh(mesh);
		}
		shader.endObject(clouds);
		r.disuseCurrentShader();

		this.fbo.disuse();

		// restore the renderer's default GL state
		gl.disable(gl.BLEND);
		gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE_MINUS_DST_ALPHA, gl.ONE);
		gl.depthMask(true);
		gl.enable(gl.DEPTH_TEST);

		// publish to the standard shader for ground / scene dappling
		const std = ShaderSources.standard.instance;
		if (std) {
			if (this.groundShadowEnabled) {
				std._cloudShadowMap = this.fbo.texture;
				std._cloudShadowMatrix = this.lightViewProj;
				std._cloudShadowDensity = this.density;
				std._cloudShadowIntensity = this.groundIntensity;
			} else {
				std._cloudShadowMap = undefined;
			}
		}

		// publish to the shaft ray-march shader
		const gr = ShaderSources.cloudgodray.instance;
		if (gr) {
			// cloud layer altitude band, so the march only shadows sub-cloud air
			const o = clouds.options || {};
			const H = (clouds.location ? clouds.location.y : 0) + (typeof o.height === "number" ? o.height : 60);
			const band = (typeof this.cloudBand === "number")
				? this.cloudBand : Math.max((o.clusterThickness || 10) * 2, 80);

			gr.cloudShadowMap = this.fbo.texture;
			gr.cloudShadowMatrix = this.lightViewProj;
			gr.density = this.density;
			gr.cloudBaseY = H - band;
			gr.cloudTopY = H + band;
			gr.color = this.color;
			gr.intensity = this.intensity;
			gr.steps = this.steps;
			gr.maxDist = this.maxDist;
			gr.phaseG = this.phaseG;
			gr.scatter = this.scatter;
			gr.startJitter = this.startJitter;
		}
	}

	dispose() {
		const r = this.renderer;
		const i = r.prePasses.indexOf(this._prePass);
		if (i >= 0) r.prePasses.splice(i, 1);
		this._prePass = null;

		if (this._godrayObj) {
			this.scene.remove(this._godrayObj);
			this._godrayObj = null;
		}

		if (this.fbo) {
			this.fbo.destroy();
			this.fbo = null;
		}

		const std = ShaderSources.standard.instance;
		if (std) std._cloudShadowMap = undefined;
	}
}
