
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
		this.emitRadius = numberOr(options.emitRadius, 3.6);
		this.emitDensity = numberOr(options.emitDensity, 1.0);
		this.emitTemp = numberOr(options.emitTemp, 1.5);

		// ---- solver parameters ----
		this.dt = numberOr(options.dt, 0.12);
		this.jacobiIterations = options.jacobiIterations || 30;
		this.velDissipation = numberOr(options.velDissipation, 0.99);
		this.densityDissipation = numberOr(options.densityDissipation, 0.988);
		this.buoyancy = numberOr(options.buoyancy, 2.1);
		this.weight = numberOr(options.weight, 0.05);
		this.ambientTemp = numberOr(options.ambientTemp, 0.0);
		// vorticity confinement (turbulent curls) + a turbulence seed that breaks
		// the column's symmetry so there are eddies to confine in the first place
		this.vorticity = numberOr(options.vorticity, 0.55);
		this.seedStrength = numberOr(options.seedStrength, 11.0);
		this.time = 0;

		// ---- mouse interaction (drag injects density + velocity) ----
		this.mouseRadius = numberOr(options.mouseRadius, 4.0);
		this.mouseDensity = numberOr(options.mouseDensity, 6.0);
		this.mouseTemp = numberOr(options.mouseTemp, 0.0);
		this.mouseVelGain = numberOr(options.mouseVelGain, 6.0);
		this._mouse = { active: 0, pos: [0, 0, 0], vel: [0, 0, 0] };

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
		this._curl = new Volume3D(r, N, N, N);
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

		this.time += this.dt;
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

		// 2a. measure vorticity (curl) of the velocity field
		pass("fluid_curl", this._curl, (s) => {
			bind(s.u.velTex, 0, this._velocity.read);
		});

		// 2b. vorticity confinement: push velocity back toward the eddies
		pass("fluid_vorticity", this._velocity.write, (s) => {
			gl.uniform1f(s.u.dt, this.dt);
			gl.uniform1f(s.u.vorticity, this.vorticity);
			bind(s.u.velTex, 0, this._velocity.read);
			bind(s.u.curlTex, 1, this._curl);
		});
		this._velocity.swap();

		// 3. buoyancy + turbulence seed + mouse impulse (acts on velocity)
		pass("fluid_force", this._velocity.write, (s) => {
			gl.uniform1f(s.u.dt, this.dt);
			gl.uniform1f(s.u.buoyancy, this.buoyancy);
			gl.uniform1f(s.u.weight, this.weight);
			gl.uniform1f(s.u.ambientTemp, this.ambientTemp);
			gl.uniform1f(s.u.time, this.time);
			gl.uniform1f(s.u.seedStrength, this.seedStrength);
			this._setMouse(s, true);
			bind(s.u.velTex, 0, this._velocity.read);
			bind(s.u.dcTex, 1, this._density.read);
		});
		this._velocity.swap();

		// 4. transport density + temperature along the velocity
		pass("fluid_advect", this._density.write, (s) => {
			gl.uniform1f(s.u.dt, this.dt);
			gl.uniform1f(s.u.dissipation, this.densityDissipation);
			bind(s.u.velTex, 0, this._velocity.read);
			bind(s.u.srcTex, 1, this._density.read);
		});
		this._density.swap();

		// 5. inject fresh smoke + heat at the emitter (and the mouse)
		pass("fluid_emit", this._density.write, (s) => {
			gl.uniform1f(s.u.dt, this.dt);
			gl.uniform3f(s.u.emitPos, this.emitPos[0], this.emitPos[1], this.emitPos[2]);
			gl.uniform1f(s.u.emitRadius, this.emitRadius);
			gl.uniform1f(s.u.emitDensity, this.emitDensity);
			gl.uniform1f(s.u.emitTemp, this.emitTemp);
			this._setMouse(s, false);
			bind(s.u.dcTex, 0, this._density.read);
		});
		this._density.swap();

		// 6. measure the velocity's divergence
		pass("fluid_divergence", this._divergence, (s) => {
			bind(s.u.velTex, 0, this._velocity.read);
		});

		// 7. solve ∇²p = divergence (Jacobi, warm-started from last frame)
		for (let k = 0; k < this.jacobiIterations; k++) {
			pass("fluid_jacobi", this._pressure.write, (s) => {
				bind(s.u.pressureTex, 0, this._pressure.read);
				bind(s.u.divergenceTex, 1, this._divergence);
			});
			this._pressure.swap();
		}

		// 8. subtract the pressure gradient → divergence-free velocity
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

	// push the current mouse splat onto a sim shader (no-op uniforms for the
	// channels a given pass lacks are silently ignored by WebGL)
	_setMouse(s, includeVel) {
		const gl = this.renderer.gl, m = this._mouse;
		gl.uniform1f(s.u.mouseActive, m.active);
		gl.uniform3f(s.u.mousePos, m.pos[0], m.pos[1], m.pos[2]);
		gl.uniform1f(s.u.mouseRadius, this.mouseRadius);
		if (includeVel) {
			gl.uniform3f(s.u.mouseVel, m.vel[0], m.vel[1], m.vel[2]);
		} else {
			gl.uniform1f(s.u.mouseDensity, this.mouseDensity);
			gl.uniform1f(s.u.mouseTemp, this.mouseTemp);
		}
	}

	// ---- mouse picking: NDC -> a point inside the simulation box ----
	// The example forwards pointer drags here. We cast the pixel's view ray,
	// clip it to the box, and inject at the mid-point of the inside segment;
	// the frame-to-frame motion of that point becomes the injected velocity.
	pointerDrag(nx, ny, nxPrev, nyPrev) {
		const pvm = this.renderer.projectionViewMatrix;
		if (!pvm) return;
		const inv = pvm.inverse().toArray();
		const pick = this._pickBox(inv, nx, ny);
		if (!pick) { this._mouse.active = 0; return; }

		const gp = this._worldToGrid(pick);
		let vel = [0, 0, 0];
		if (nxPrev !== undefined) {
			const prev = this._pickBox(inv, nxPrev, nyPrev);
			if (prev) {
				const s = this.mouseVelGain * this.N / (this.boxMax[1] - this.boxMin[1]);
				vel = [(pick[0] - prev[0]) * s, (pick[1] - prev[1]) * s, (pick[2] - prev[2]) * s];
			}
		}
		this._mouse = { active: 1, pos: gp, vel };
	}

	pointerEnd() { this._mouse.active = 0; }

	// clear all simulation state back to empty (panel "reset")
	reset() {
		if (!this._supported) return;
		const gl = this.renderer.gl, T = this._target;
		gl.bindFramebuffer(gl.FRAMEBUFFER, T.framebuffer);
		gl.clearColor(0, 0, 0, 0);
		const clear = (vol) => {
			for (let z = 0; z < vol.depth; z++) { T.setLayer(vol, z); gl.clear(gl.COLOR_BUFFER_BIT); }
		};
		clear(this._velocity.a); clear(this._velocity.b);
		clear(this._density.a); clear(this._density.b);
		clear(this._pressure.a); clear(this._pressure.b);
		T.unbind();
		if (this.renderer.setViewportToPhysicalRenderSize) this.renderer.setViewportToPhysicalRenderSize();
	}

	_pickBox(inv, nx, ny) {
		const np = mulVec4(inv, nx, ny, -1, 1);
		const fp = mulVec4(inv, nx, ny, 1, 1);
		const ro = [np[0] / np[3], np[1] / np[3], np[2] / np[3]];
		const fwd = [fp[0] / fp[3] - ro[0], fp[1] / fp[3] - ro[1], fp[2] / fp[3] - ro[2]];
		const len = Math.hypot(fwd[0], fwd[1], fwd[2]) || 1;
		const rd = [fwd[0] / len, fwd[1] / len, fwd[2] / len];

		let tn = -Infinity, tf = Infinity;
		for (let i = 0; i < 3; i++) {
			const invd = 1 / rd[i];
			let t0 = (this.boxMin[i] - ro[i]) * invd;
			let t1 = (this.boxMax[i] - ro[i]) * invd;
			if (t0 > t1) { const t = t0; t0 = t1; t1 = t; }
			tn = Math.max(tn, t0); tf = Math.min(tf, t1);
		}
		const t0 = Math.max(tn, 0);
		if (tf <= t0) return null;
		const t = 0.5 * (t0 + tf);
		return [ro[0] + rd[0] * t, ro[1] + rd[1] * t, ro[2] + rd[2] * t];
	}

	_worldToGrid(p) {
		return [
			(p[0] - this.boxMin[0]) / (this.boxMax[0] - this.boxMin[0]) * this.N,
			(p[1] - this.boxMin[1]) / (this.boxMax[1] - this.boxMin[1]) * this.N,
			(p[2] - this.boxMin[2]) / (this.boxMax[2] - this.boxMin[2]) * this.N,
		];
	}

	_render() {
		const r = this.renderer, gl = r.gl;

		this._ensureFBO();
		this.invViewProj = r.projectionViewMatrix.inverse();
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
		if (this._curl) { this._curl.destroy(); this._curl = null; }
		if (this._target) { this._target.destroy(); this._target = null; }

		const comp = ShaderSources.fluidcomposite.instance;
		if (comp) comp.cloudTexture = null;
	}
}

function numberOr(value, fallback) {
	return (typeof value === "number") ? value : fallback;
}

// column-major mat4 (16-float array) times a vec4 -> [x,y,z,w]
function mulVec4(m, x, y, z, w) {
	return [
		m[0] * x + m[4] * y + m[8] * z + m[12] * w,
		m[1] * x + m[5] * y + m[9] * z + m[13] * w,
		m[2] * x + m[6] * y + m[10] * z + m[14] * w,
		m[3] * x + m[7] * y + m[11] * z + m[15] * w,
	];
}
