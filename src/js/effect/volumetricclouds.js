
import { Vec3 } from "@/math";
import { FrameBuffer } from "../webgl/buffers";
import { ScreenMesh } from "../render/pipeline";
import { SceneObject } from "../scene/object";
import { ShaderSources } from "../shader/shadersources";

// VolumetricClouds — a ray-marched volumetric cloud layer.
//
// Each frame a PRE-PASS ray-marches a flat cloud slab (between cloudBaseY and
// cloudTopY) into a half-resolution HDR buffer: density comes from procedural
// hash-based 3D noise (no 3D textures, so it stays within the engine's WebGL
// feature set) and lighting is single-scattering with a sun-ward self-shadow
// march. An in-scene full-screen pass then composites that buffer over the
// scene with premultiplied alpha, so the clouds bloom and tonemap with
// everything else. Pairs naturally with DynamicSky: the sun direction and tint
// are read from the scene sun (which DynamicSky drives), so the clouds relight
// as the day moves.
//
//   const sky = new DynamicSky(renderer, { light: scene.sun });
//   scene.skybox = sky;
//   const clouds = new VolumetricClouds(scene, {
//     cloudBaseY: 600, cloudTopY: 1100, coverage: 0.5,
//   });
//
// The heavy march runs at half resolution (resScale) to stay affordable; raise
// steps / lightSteps / resScale for quality, lower them for speed. Requires
// WebGL2 for the float buffer; falls back to RGBA8 on WebGL1. Call dispose().
export class VolumetricClouds {
	constructor(scene, options = {}) {
		this.scene = scene;
		this.renderer = scene.renderer;
		this.enabled = options.enabled !== false;

		// sun source (defaults to the scene sun, which DynamicSky drives)
		this._follow = options.follow || scene.sun || null;

		// cloud layer altitude band + shape
		this.cloudBaseY = numberOr(options.cloudBaseY, 600);
		this.cloudTopY = numberOr(options.cloudTopY, 1100);
		this.coverage = numberOr(options.coverage, 0.5);
		this.extinction = numberOr(options.extinction, 0.04);
		this.detailScale = numberOr(options.detailScale, 0.5);
		this.baseFreq = numberOr(options.baseFreq, 0.0022);
		this.phaseG = numberOr(options.phaseG, 0.6);
		this.sunAbsorption = numberOr(options.sunAbsorption, 1.0);
		this.maxDist = numberOr(options.maxDist, 30000);
		this.steps = options.steps || 48;
		this.lightSteps = options.lightSteps || 6;

		// wind (horizontal drift direction + speed)
		const w = options.windDir;
		this.windDir = w ? [w[0] !== undefined ? w[0] : w.x, w[1] !== undefined ? w[1] : w.y] : [1.0, 0.35];
		this.windSpeed = numberOr(options.windSpeed, 12.0);

		// lighting (sun radiance scale + sky/ground ambient fill)
		this.sunIntensity = numberOr(options.sunIntensity, 6.0);
		this._baseAmbient = options.ambientColor || new Vec3(0.55, 0.66, 0.85);
		this._baseGround = options.groundColor || new Vec3(0.32, 0.30, 0.30);

		// resolution scale of the ray-march buffer (0.5 = half res)
		this.resScale = numberOr(options.resScale, 0.5);

		// per-frame state read by the shader via setFrame()
		this.invViewProj = null;
		this.cameraPos = new Vec3(0, 0, 0);
		this.sunDir = new Vec3(0, 1, 0);
		this.sunColor = [1, 1, 1];
		this.ambientColor = [this._baseAmbient.x, this._baseAmbient.y, this._baseAmbient.z];
		this.groundColor = [this._baseGround.x, this._baseGround.y, this._baseGround.z];
		this.time = 0;
		this._t0 = (typeof performance !== "undefined" && performance.now) ? performance.now() : 0;

		// Multi-octave value-noise baked once into a tileable 3D texture. The
		// shader replaces its per-sample FBM (5 octaves of hash noise, evaluated
		// thousands of times per pixel) with a single hardware-filtered fetch.
		// noiseInvTile maps q-space (world * baseFreq) to the [0,1) texture tile;
		// 1/L0 makes the texture's lowest octave match the old FBM's unit lattice.
		this._noiseTex = null;
		this._noiseInvTile = 1 / 4;
		this._buildNoise();

		this._screen = new ScreenMesh();
		this._fbo = null;
		this._ensureFBO();

		// pre-pass: ray-march the clouds into the half-res buffer each frame
		this._prePass = () => this._renderClouds();
		this.renderer.prePasses.push(this._prePass);

		// in-scene composite (drawn last), premultiplied over the scene
		const obj = new SceneObject();
		obj.addMesh(new ScreenMesh());
		obj.shader = { name: "volcloudcomposite" };
		obj.castShadow = false;
		obj.receiveShadow = false;
		obj.receiveLight = false;
		obj.getBounds = () => null;   // never pollute shadow / fit bounds
		this._compositeObj = obj;
		scene.add(obj);
	}

	setFollow(target) { this._follow = target || null; return this; }

	// Bake the tileable 3D noise volume (R8, 64^3) the shader samples for the
	// cloud shape and detail. Done once on the CPU at construction. Requires
	// WebGL2 (3D textures); on WebGL1 _noiseTex stays null and the clouds are
	// skipped — the same WebGL2 the dynamic sky / IBL already need.
	_buildNoise() {
		const r = this.renderer, gl = r.gl;
		if (!r.isWebGL2) {
			this._noiseTex = null;
			console.warn("VolumetricClouds requires WebGL2 (3D textures / GLSL ES 3.00); clouds disabled.");
			return;
		}

		const N = 64;     // texture resolution
		const L0 = 4;     // lattice cells per tile at octave 0
		const OCT = 5;
		this._noiseInvTile = 1 / L0;

		// deterministic PRNG (mulberry32) so the cloud field is stable per reload
		let s = 0x9e3779b9 >>> 0;
		const rand = () => {
			s = (s + 0x6d2b79f5) | 0;
			let t = Math.imul(s ^ (s >>> 15), 1 | s);
			t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
			return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
		};

		// per-octave random lattices; period doubles each octave (4,8,16,32,64)
		// and corners wrap modulo the period, which makes the volume seamless.
		const grids = [], periods = [];
		for (let o = 0; o < OCT; o++) {
			const P = L0 << o;
			periods.push(P);
			const g = new Float32Array(P * P * P);
			for (let i = 0; i < g.length; i++) g[i] = rand();
			grids.push(g);
		}

		// FBM with the same amplitude falloff (0.5, 0.25, …) as the old GLSL fbm,
		// so its value range — and therefore the coverage threshold — is unchanged.
		const data = new Uint8Array(N * N * N);
		let idx = 0;
		for (let z = 0; z < N; z++) {
			const wz = (z + 0.5) / N;
			for (let y = 0; y < N; y++) {
				const wy = (y + 0.5) / N;
				for (let x = 0; x < N; x++) {
					const wx = (x + 0.5) / N;
					let amp = 0.5, sum = 0;
					for (let o = 0; o < OCT; o++) {
						sum += amp * valueNoise3D(wx, wy, wz, periods[o], grids[o]);
						amp *= 0.5;
					}
					data[idx++] = Math.max(0, Math.min(255, (sum * 255) | 0));
				}
			}
		}

		const tex = gl.createTexture();
		gl.bindTexture(gl.TEXTURE_3D, tex);
		gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
		gl.texImage3D(gl.TEXTURE_3D, 0, gl.R8, N, N, N, 0, gl.RED, gl.UNSIGNED_BYTE, data);
		gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
		gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
		gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_S, gl.REPEAT);
		gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_T, gl.REPEAT);
		gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_R, gl.REPEAT);
		gl.bindTexture(gl.TEXTURE_3D, null);
		this._noiseTex = tex;
	}

	_ensureFBO() {
		const r = this.renderer;
		const rps = r.renderPhysicalSize || { width: r.canvas.width, height: r.canvas.height };
		const w = Math.max(2, Math.floor((rps.width || r.canvas.width) * this.resScale));
		const h = Math.max(2, Math.floor((rps.height || r.canvas.height) * this.resScale));
		if (this._fbo && this._fbo.width === w && this._fbo.height === h) return;
		if (this._fbo) this._fbo.destroy();
		this._fbo = new FrameBuffer(r, w, h, { depthBuffer: false, clearBackground: false, float: r.extHDR });
	}

	// unit direction toward the sun (world space), from the follow target
	_sunDir() {
		const f = this._follow;
		const d = f && (f.direction || f.worldLocation || f.location);
		if (d) {
			const x = d.x !== undefined ? d.x : d[0];
			const y = d.y !== undefined ? d.y : d[1];
			const z = d.z !== undefined ? d.z : d[2];
			const len = Math.hypot(x, y, z) || 1;
			return new Vec3(x / len, y / len, z / len);
		}
		return new Vec3(0, 1, 0);
	}

	_renderClouds() {
		// no baked noise (WebGL1) → never touch the ES 3.00 raymarch shader
		if (!this.enabled || !this._noiseTex) {
			if (this._compositeObj) this._compositeObj.visible = false;
			return;
		}
		if (this._compositeObj) this._compositeObj.visible = true;

		const r = this.renderer, gl = r.gl;

		this._ensureFBO();

		// gather per-frame inputs
		const now = (typeof performance !== "undefined" && performance.now) ? performance.now() : 0;
		this.time = (now - this._t0) * 0.001 * this.windSpeed;
		// inverse() returns a new matrix and leaves the renderer's matrix intact,
		// which matters here: this runs in a pre-pass *before* the scene draw.
		this.invViewProj = r.projectionViewMatrix.inverse();
		const cam = this.scene.mainCamera;
		this.cameraPos = cam ? cam.worldLocation : new Vec3(0, 0, 0);
		this.sunDir = this._sunDir();

		// sun colour from the (dynamic) sun, scaled for cloud silver lining
		const sc = (this._follow && this._follow.mat && this._follow.mat.color) || [1.0, 0.98, 0.95];
		const k = this.sunIntensity;
		this.sunColor = [sc[0] * k, sc[1] * k, sc[2] * k];

		// dim the ambient fill toward night so clouds go dark with the sky
		const day = clamp((this.sunDir.y + 0.1) / 0.3, 0.0, 1.0);
		this.ambientColor = [this._baseAmbient.x * day, this._baseAmbient.y * day, this._baseAmbient.z * day];
		this.groundColor = [this._baseGround.x * day, this._baseGround.y * day, this._baseGround.z * day];

		// ray-march into the half-res buffer
		gl.clearColor(0, 0, 0, 0);
		this._fbo.use();                 // binds, sets viewport, clears to transparent
		gl.disable(gl.DEPTH_TEST);
		gl.depthMask(false);
		gl.disable(gl.BLEND);

		const shader = ShaderSources.volcloud.instance;
		r.useShader(shader);
		shader.setFrame(this);
		shader.beginMesh(this._screen);
		this._screen.draw(r);
		shader.endMesh(this._screen);
		r.disuseCurrentShader();

		// release the 3D noise from texture unit 0 so it can't shadow a later
		// 2D bind on the same unit.
		gl.activeTexture(gl.TEXTURE0);
		gl.bindTexture(gl.TEXTURE_3D, null);

		this._fbo.disuse();

		// restore the renderer's default GL state + full-size viewport (the FBO
		// shrank it to half res; the main scene pass renders right after).
		if (r.setViewportToPhysicalRenderSize) r.setViewportToPhysicalRenderSize();
		gl.enable(gl.DEPTH_TEST);
		gl.depthMask(true);
		gl.disable(gl.BLEND);
		gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE_MINUS_DST_ALPHA, gl.ONE);

		// hand the buffer to the in-scene composite pass
		const comp = ShaderSources.volcloudcomposite.instance;
		if (comp) comp.cloudTexture = this._fbo.texture;
	}

	dispose() {
		const r = this.renderer;
		const i = r.prePasses.indexOf(this._prePass);
		if (i >= 0) r.prePasses.splice(i, 1);
		this._prePass = null;

		if (this._compositeObj) {
			this.scene.remove(this._compositeObj);
			this._compositeObj = null;
		}
		if (this._fbo) {
			this._fbo.destroy();
			this._fbo = null;
		}
		if (this._screen) {
			this._screen.destroy();
			this._screen = null;
		}
		if (this._noiseTex) {
			r.gl.deleteTexture(this._noiseTex);
			this._noiseTex = null;
		}
		const comp = ShaderSources.volcloudcomposite.instance;
		if (comp) comp.cloudTexture = null;
	}
}

function numberOr(value, fallback) {
	return (typeof value === "number") ? value : fallback;
}

// Tileable trilinear value noise sampled from a period-P random lattice. (wx,wy,wz)
// are in [0,1) tile space; lattice corners wrap modulo P so the result is seamless.
function valueNoise3D(wx, wy, wz, P, g) {
	const px = wx * P, py = wy * P, pz = wz * P;
	const ix = Math.floor(px), iy = Math.floor(py), iz = Math.floor(pz);
	let fx = px - ix, fy = py - iy, fz = pz - iz;
	fx = fx * fx * (3 - 2 * fx);
	fy = fy * fy * (3 - 2 * fy);
	fz = fz * fz * (3 - 2 * fz);
	const x0 = ((ix % P) + P) % P, y0 = ((iy % P) + P) % P, z0 = ((iz % P) + P) % P;
	const x1 = (x0 + 1) % P, y1 = (y0 + 1) % P, z1 = (z0 + 1) % P;
	const yP0 = y0 * P, yP1 = y1 * P, zPP0 = z0 * P * P, zPP1 = z1 * P * P;
	const g000 = g[zPP0 + yP0 + x0], g100 = g[zPP0 + yP0 + x1];
	const g010 = g[zPP0 + yP1 + x0], g110 = g[zPP0 + yP1 + x1];
	const g001 = g[zPP1 + yP0 + x0], g101 = g[zPP1 + yP0 + x1];
	const g011 = g[zPP1 + yP1 + x0], g111 = g[zPP1 + yP1 + x1];
	const c00 = g000 + (g100 - g000) * fx, c10 = g010 + (g110 - g010) * fx;
	const c01 = g001 + (g101 - g001) * fx, c11 = g011 + (g111 - g011) * fx;
	const c0 = c00 + (c10 - c00) * fy, c1 = c01 + (c11 - c01) * fy;
	return c0 + (c1 - c0) * fz;
}

function clamp(x, a, b) {
	return Math.min(b, Math.max(a, x));
}
