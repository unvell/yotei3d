
import { ParticleObject } from "../scene/object.js";
import { ParticleMesh } from "../webgl/mesh.js";
import { SnowMaterial } from "./snow.js";
import { arraySet } from "../utility/utility";

// Splash — a reusable particle burst emitter (generic base).
//
// A shared pool of soft round sprites, fired in bursts from any world point.
// Each particle launches with an upward + outward velocity, arcs under gravity,
// and fades out (it pops in, holds, then shrinks away — or dies the moment it
// falls back through the kill plane, e.g. a water surface). It reuses the "snow"
// point-sprite renderer (round, soft, alpha-blended), so it needs no new shader
// and drops into any scene.
//
// This base is the engine; use a tuned subclass — `WaterSplash` for spray,
// (and e.g. a future `FireSplash` for embers). Generic usage:
//   const splash = new WaterSplash({ level: 0 });
//   scene.add(splash);                          // add AFTER opaque geometry
//   scene.on("frame", () => splash.update());
//   splash.burst([x, 0, z], { count: 50, speed: 9 });   // e.g. an impact
//
// With the Dolphin effect, wire its water-crossing hook:
//   dolphin.onSplash = (pos, kind) => splash.burst(pos, { count: kind === "enter" ? 60 : 40 });
export class Splash extends ParticleObject {
	// Defaults shared by all splashes; subclasses override via DEFAULTS.
	static DEFAULTS = {
		maxParticles: 800,    // pool size (oldest particles are recycled)
		gravity: 22,          // downward acceleration (units/s^2; negative floats up)
		drag: 0.7,            // air drag (fraction of velocity shed per second)
		level: 0,             // kill plane: particles falling below this die
		killAtLevel: true,    // set false for bursts not tied to a surface
		color: [1.0, 1.0, 1.0],
		opacity: 0.85,
		sizeScale: 22,        // perspective reference depth (see SnowMaterial)
		maxSize: 90,
	};

	constructor(options = {}) {
		super();

		const opt = this.options = Object.assign({}, this.constructor.DEFAULTS, options);

		const n = this.maxParticles = Math.max(1, Math.floor(opt.maxParticles));

		this.mat = this._createMaterial(opt);

		this._px = new Float32Array(n);
		this._py = new Float32Array(n);
		this._pz = new Float32Array(n);
		this._vx = new Float32Array(n);
		this._vy = new Float32Array(n);
		this._vz = new Float32Array(n);
		this._life = new Float32Array(n);     // remaining seconds (<=0 = dead)
		this._maxLife = new Float32Array(n);
		this._size0 = new Float32Array(n);    // base size in px
		this._cursor = 0;
		this._lastTime = 0;

		this.mesh = new ParticleMesh(n);
		this.addMesh(this.mesh);
		this._writeAll();   // all dead -> all size 0 -> nothing drawn yet
	}

	// Builds the point-sprite material. Subclasses override to change the look
	// (colour, opacity, blending) — e.g. a future FireSplash with warm additive
	// embers. The base uses the round soft alpha-blended "snow" sprite.
	_createMaterial(opt) {
		return new SnowMaterial({
			color: opt.color,
			opacity: opt.opacity,
			sizeScale: opt.sizeScale,
			maxSize: opt.maxSize,
			focusDist: 0,         // no near-blur for crisp sprites
			focusRange: 1,
		});
	}

	// Fire a burst of droplets from `pos` ([x,y,z]).
	// opts: count, speed (launch speed), spread (0..1 lateral vs upward),
	//       up (upward bias multiplier), life [min,max] sec, size [min,max] px.
	burst(pos, opts = {}) {
		const count = Math.max(1, Math.floor(opts.count != null ? opts.count : 40));
		const speed = opts.speed != null ? opts.speed : 8;
		const spread = opts.spread != null ? opts.spread : 0.55;
		const up = opts.up != null ? opts.up : 1.0;
		const lifeMin = opts.life ? opts.life[0] : 0.5;
		const lifeMax = opts.life ? opts.life[1] : 1.1;
		const sizeMin = opts.size ? opts.size[0] : 5;
		const sizeMax = opts.size ? opts.size[1] : 14;

		const n = this.maxParticles;
		for (let k = 0; k < count; k++) {
			const i = this._cursor;
			this._cursor = (this._cursor + 1) % n;

			// a crown: outward radial velocity + upward jet, with jitter
			const theta = Math.random() * Math.PI * 2;
			const radial = speed * spread * (0.2 + Math.random() * 0.8);
			const upward = speed * up * (0.5 + Math.random() * 0.7);

			this._px[i] = pos[0] + (Math.random() - 0.5) * 0.4;
			this._py[i] = pos[1] + Math.random() * 0.3;
			this._pz[i] = pos[2] + (Math.random() - 0.5) * 0.4;
			this._vx[i] = Math.cos(theta) * radial;
			this._vz[i] = Math.sin(theta) * radial;
			this._vy[i] = upward;
			const ml = lifeMin + Math.random() * (lifeMax - lifeMin);
			this._maxLife[i] = ml;
			this._life[i] = ml;
			this._size0[i] = sizeMin + Math.random() * (sizeMax - sizeMin);
		}
	}

	update() {
		const now = (typeof performance !== "undefined" ? performance.now() : Date.now());
		let dt = this._lastTime ? (now - this._lastTime) / 1000 : 0.016;
		this._lastTime = now;
		if (dt > 0.05) dt = 0.05;

		const o = this.options;
		const n = this.maxParticles;
		const damp = Math.max(0, 1 - o.drag * dt);
		const g = o.gravity * dt;

		for (let i = 0; i < n; i++) {
			if (this._life[i] <= 0) continue;

			this._life[i] -= dt;
			this._vy[i] -= g;
			this._vx[i] *= damp;
			this._vy[i] *= damp;
			this._vz[i] *= damp;
			this._px[i] += this._vx[i] * dt;
			this._py[i] += this._vy[i] * dt;
			this._pz[i] += this._vz[i] * dt;

			// die when spent, or when falling back through the kill plane
			if (this._life[i] <= 0 ||
				(o.killAtLevel && this._vy[i] < 0 && this._py[i] < o.level)) {
				this._life[i] = 0;
			}
		}

		this._writeAll();
	}

	_writeAll() {
		const n = this.maxParticles;
		const vb = this.mesh.vertexBuffer;
		const col = this.mat.color;
		const c = Array.isArray(col) ? col : [col.r, col.g, col.b];

		for (let i = 0; i < n; i++) {
			let size = 0, b = 0;
			if (this._life[i] > 0) {
				const age = 1 - this._life[i] / this._maxLife[i];       // 0..1
				const popIn = smoothstep(0.0, 0.12, age);               // quick appear
				const fadeOut = clamp(this._life[i] / (0.4 * this._maxLife[i]), 0, 1);
				size = this._size0[i] * Math.min(popIn, fadeOut);
				b = 0.75 + 0.25 * fadeOut;
			}
			arraySet(vb, i * 3, this._px[i], this._py[i], this._pz[i]);
			arraySet(vb, (n + i) * 3, c[0] * b, c[1] * b, c[2] * b);
			arraySet(vb, n * 6 + i, size);
		}

		this.mesh.update();
	}
}

function smoothstep(e0, e1, x) {
	const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
	return t * t * (3.0 - 2.0 * t);
}
function clamp(x, a, b) { return Math.min(b, Math.max(a, x)); }

// WaterSplash — spray/droplets of water. White-blue, falls under gravity, and
// dies on the way back down through the water surface (`level`).
export class WaterSplash extends Splash {
	static DEFAULTS = Object.assign({}, Splash.DEFAULTS, {
		gravity: 22,
		drag: 0.6,
		color: [0.93, 0.97, 1.0],
		opacity: 0.9,
		killAtLevel: true,
	});
}
