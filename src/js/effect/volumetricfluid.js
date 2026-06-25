
import { Vec3 } from "@/math";
import { FrameBuffer } from "../webgl/buffers";
import { Volume3D, PingPongVolume, Volume3DTarget } from "../webgl/volume3d";
import { ScreenMesh } from "../render/pipeline";
import { SceneObject } from "../scene/object";
import { ShaderSources } from "../shader/shadersources";

// VolumetricFluid — a real-time GPU smoke/fire simulation on a 3D grid.
//
// The fluid state lives in 3D textures (velocity, density+temperature, pressure)
// that are UPDATED on the GPU every frame — the read/write counterpart to the
// volumetric-cloud noise volume, which is baked once and only sampled. Each
// frame a pre-pass runs the classic incompressible "stable fluids" steps as
// full-volume fragment kernels (see src/shader/fluid_*.frag):
//
//   advect velocity → buoyancy → advect density/temp → emit
//     → divergence → pressure (Jacobi×N) → project (subtract pressure gradient)
//
// then ray-marches the density box into a half-res buffer, which an in-scene
// composite blends over the scene with premultiplied alpha — exactly the
// VolumetricClouds wiring. Requires WebGL2 (3D textures + float render targets).
//
// STAGE 2: solver + a simple emission/absorption render, enough to watch a
// plume rise. Lighting, blackbody fire, and mouse interaction come next.
export class VolumetricFluid {
	constructor(scene, options = {}) {
		this.scene = scene;
		this.renderer = scene.renderer;
		this.enabled = options.enabled !== false;

		// grid resolution (cubic). 64^3 RGBA16F ≈ 2 MB per buffer.
		this.N = options.resolution || 64;

		// ---- world-space box the simulation occupies ----
		const size = options.boxSize || [12, 18, 12];
		const center = options.boxCenter || [0, size[1] * 0.5, 0];
		this.boxMin = [center[0] - size[0] * 0.5, center[1] - size[1] * 0.5, center[2] - size[2] * 0.5];
		this.boxMax = [center[0] + size[0] * 0.5, center[1] + size[1] * 0.5, center[2] + size[2] * 0.5];

		// ---- emitter (grid coords): a source at the bottom-center ----
		const N = this.N;
		this.emitPos = options.emitPos || [N * 0.5, N * 0.12, N * 0.5];
		this.emitRadius = numberOr(options.emitRadius, 5.0);
		this.emitDensity = numberOr(options.emitDensity, 1.2);
		this.emitTemp = numberOr(options.emitTemp, 1.5);

		// ---- solver parameters ----
		this.dt = numberOr(options.dt, 0.12);
		this.jacobiIterations = options.jacobiIterations || 30;
		this.velDissipation = numberOr(options.velDissipation, 0.99);
		this.densityDissipation = numberOr(options.densityDissipation, 0.985);
		this.buoyancy = numberOr(options.buoyancy, 1.6);
		this.weight = numberOr(options.weight, 0.05);
		this.ambientTemp = numberOr(options.ambientTemp, 0.0);

		// ---- render parameters ----
		this.densityScale = numberOr(options.densityScale, 4.5);   // extinction
		this.smokeColor = options.smokeColor || [0.9, 0.9, 0.92];  // albedo
		this.renderSteps = options.renderSteps || 80;
		this.resScale = numberOr(options.resScale, 0.5);

		// lighting: a sun (self-shadowed single scattering) + sky ambient fill
		this._follow = options.follow || scene.sun || null;
		this.sunIntensity = numberOr(options.sunIntensity, 2.0);
		this.ambientColor = options.ambientColor || [0.18, 0.21, 0.28];
		this.shadowDensity = numberOr(options.shadowDensity, 1.0);
		this.lightSteps = options.lightSteps || 6;
		this.phaseG = numberOr(options.phaseG, 0.3);

		// fire: HDR emission mapped from the temperature channel (0 = pure smoke)
		this.fireGain = numberOr(options.fireGain, 0.0);
		this.fireTempScale = numberOr(options.fireTempScale, 4.0);

		// per-frame state read by the raymarch shader via setFrame()
		this.invViewProj = null;
		this.cameraPos = new Vec3(0, 0, 0);
		this.sunDir = new Vec3(0, 1, 0);
		this.sunColor = [1, 1, 1];
		this.lightStepLen = 1;

		this._screen = new ScreenMesh();
		this._fbo = null;
		this._target = null;
		this._velocity = this._density = this._pressure = this._divergence = null;

		this._supported = this.renderer.isWebGL2 && this.renderer.extHDR;
		if (!this._supported) {
			console.warn("VolumetricFluid requires WebGL2 + EXT_color_buffer_float; disabled.");
		} else {
			this._allocate();
		}

		this._ensureFBO();

		// per-frame simulation + render, before the scene draw
		this._prePass = () => this._frame();
		this.renderer.prePasses.push(this._prePass);

		// in-scene composite (drawn last), premultiplied over the scene
		const obj = new SceneObject();
		obj.addMesh(new ScreenMesh());
		obj.shader = { name: "fluidcomposite" };
		obj.castShadow = false;
		obj.receiveShadow = false;
		obj.receiveLight = false;
		obj.getBounds = () => null;
		this._compositeObj = obj;
		scene.add(obj);
	}

	_allocate() {
		const r = this.renderer, N = this.N;
		// velocity (xyz) and density/temperature (R/G) both need trilinear
		// filtering (advection samples between cells); RGBA16F gives that and is
		// render-able under EXT_color_buffer_float.
		this._velocity = new PingPongVolume(r, N, N, N);
		this._density = new PingPongVolume(r, N, N, N);
		this._pressure = new PingPongVolume(r, N, N, N);
		this._divergence = new Volume3D(r, N, N, N);
		this._target = new Volume3DTarget(r);
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

	_frame() {
		if (!this.enabled || !this._supported) {
			if (this._compositeObj) this._compositeObj.visible = false;
			return;
		}
		if (this._compositeObj) this._compositeObj.visible = true;

		this._simulate();
		this._render();
	}

	// One incompressible "stable fluids" step. Every pass writes a full volume by
	// looping its fragment kernel over all Z-slices (Volume3DTarget). Ping-pong
	// buffers guarantee we never sample the texture we are writing.
	_simulate() {
		const r = this.renderer, gl = r.gl, N = this.N, T = this._target;

		const bind = (loc, unit, vol) => { gl.uniform1i(loc, unit); vol.bindSampler(unit); };

		const pass = (name, writeVol, setup) => {
			const s = ShaderSources[name].instance;
			s.use();                                  // gl.useProgram + sets renderer.currentShader
			gl.uniform3f(s.u.uN, N, N, N);
			setup(s);
			T.renderAllSlices(writeVol, s, (z) => gl.uniform1f(s.u.zLayer, z));
		};

		// 1. transport the velocity field along itself
		pass("fluid_advect", this._velocity.write, (s) => {
			gl.uniform1f(s.u.dt, this.dt);
			gl.uniform1f(s.u.dissipation, this.velDissipation);
			bind(s.u.velTex, 0, this._velocity.read);
			bind(s.u.srcTex, 1, this._velocity.read);
		});
		this._velocity.swap();

		// 2. buoyancy: hot rises, dense sinks (acts on velocity)
		pass("fluid_force", this._velocity.write, (s) => {
			gl.uniform1f(s.u.dt, this.dt);
			gl.uniform1f(s.u.buoyancy, this.buoyancy);
			gl.uniform1f(s.u.weight, this.weight);
			gl.uniform1f(s.u.ambientTemp, this.ambientTemp);
			bind(s.u.velTex, 0, this._velocity.read);
			bind(s.u.dcTex, 1, this._density.read);
		});
		this._velocity.swap();

		// 3. transport density + temperature along the velocity
		pass("fluid_advect", this._density.write, (s) => {
			gl.uniform1f(s.u.dt, this.dt);
			gl.uniform1f(s.u.dissipation, this.densityDissipation);
			bind(s.u.velTex, 0, this._velocity.read);
			bind(s.u.srcTex, 1, this._density.read);
		});
		this._density.swap();

		// 4. inject fresh smoke + heat at the emitter
		pass("fluid_emit", this._density.write, (s) => {
			gl.uniform1f(s.u.dt, this.dt);
			gl.uniform3f(s.u.emitPos, this.emitPos[0], this.emitPos[1], this.emitPos[2]);
			gl.uniform1f(s.u.emitRadius, this.emitRadius);
			gl.uniform1f(s.u.emitDensity, this.emitDensity);
			gl.uniform1f(s.u.emitTemp, this.emitTemp);
			bind(s.u.dcTex, 0, this._density.read);
		});
		this._density.swap();

		// 5. measure the velocity's divergence
		pass("fluid_divergence", this._divergence, (s) => {
			bind(s.u.velTex, 0, this._velocity.read);
		});

		// 6. solve ∇²p = divergence (Jacobi, warm-started from last frame)
		for (let k = 0; k < this.jacobiIterations; k++) {
			pass("fluid_jacobi", this._pressure.write, (s) => {
				bind(s.u.pressureTex, 0, this._pressure.read);
				bind(s.u.divergenceTex, 1, this._divergence);
			});
			this._pressure.swap();
		}

		// 7. subtract the pressure gradient → divergence-free velocity
		pass("fluid_project", this._velocity.write, (s) => {
			bind(s.u.velTex, 0, this._velocity.read);
			bind(s.u.pressureTex, 1, this._pressure.read);
		});
		this._velocity.swap();

		// leave no 3D texture shadowing units 0/1 for later 2D binds
		gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_3D, null);
		gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_3D, null);
		T.unbind();
	}

	setFollow(target) { this._follow = target || null; return this; }

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

	_render() {
		const r = this.renderer, gl = r.gl;

		this._ensureFBO();
		this.invViewProj = r.projectionViewMatrix.clone().inverse();
		const cam = this.scene.mainCamera;
		this.cameraPos = cam ? cam.worldLocation : new Vec3(0, 0, 0);

		// sun direction + HDR colour from the follow target (default: scene sun)
		this.sunDir = this._sunDir();
		const sc = (this._follow && this._follow.mat && this._follow.mat.color) || [1.0, 0.96, 0.9];
		const k = this.sunIntensity;
		this.sunColor = [sc[0] * k, sc[1] * k, sc[2] * k];

		// one sun-march step ≈ a couple of grid cells in world units
		const cw = (this.boxMax[1] - this.boxMin[1]) / this.N;
		this.lightStepLen = cw * 2.0;

		gl.clearColor(0, 0, 0, 0);
		this._fbo.use();
		gl.disable(gl.DEPTH_TEST);
		gl.depthMask(false);
		gl.disable(gl.BLEND);

		const s = ShaderSources.fluid_raymarch.instance;
		r.useShader(s);
		s.setFrame(this);
		s.beginMesh(this._screen);
		this._screen.draw(r);
		s.endMesh(this._screen);
		r.disuseCurrentShader();

		gl.activeTexture(gl.TEXTURE0);
		gl.bindTexture(gl.TEXTURE_3D, null);
		this._fbo.disuse();

		if (r.setViewportToPhysicalRenderSize) r.setViewportToPhysicalRenderSize();
		gl.enable(gl.DEPTH_TEST);
		gl.depthMask(true);
		gl.disable(gl.BLEND);
		gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE_MINUS_DST_ALPHA, gl.ONE);

		const comp = ShaderSources.fluidcomposite.instance;
		if (comp) comp.cloudTexture = this._fbo.texture;
	}

	dispose() {
		const r = this.renderer;
		const i = r.prePasses.indexOf(this._prePass);
		if (i >= 0) r.prePasses.splice(i, 1);
		this._prePass = null;

		if (this._compositeObj) { this.scene.remove(this._compositeObj); this._compositeObj = null; }
		if (this._fbo) { this._fbo.destroy(); this._fbo = null; }
		if (this._screen) { this._screen.destroy(); this._screen = null; }
		if (this._velocity) { this._velocity.destroy(); this._velocity = null; }
		if (this._density) { this._density.destroy(); this._density = null; }
		if (this._pressure) { this._pressure.destroy(); this._pressure = null; }
		if (this._divergence) { this._divergence.destroy(); this._divergence = null; }
		if (this._target) { this._target.destroy(); this._target = null; }

		const comp = ShaderSources.fluidcomposite.instance;
		if (comp) comp.cloudTexture = null;
	}
}

function numberOr(value, fallback) {
	return (typeof value === "number") ? value : fallback;
}
