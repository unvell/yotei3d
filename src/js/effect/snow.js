
import { ParticleObject } from "../scene/object.js";
import { ParticleMesh } from "../webgl/mesh.js";

// Snow — a self-contained snowfall effect.
//
// A box-shaped volume of soft round flakes that fall slowly, flutter side to
// side (a per-flake sine sway) and drift with a gentle wind, recycling to the
// top once they reach the bottom. Rendered by the "snow" shader.
//
// Usage:
//   const snow = new Snow({ count: 4000, wind: [0.6, 0.2] });
//   scene.add(snow);                         // add after scene geometry
//   scene.on("frame", () => snow.update());  // drive the simulation
//   scene.animation = true;
//
export class Snow extends ParticleObject {
	constructor(options = {}) {
		super();

		const opt = this.options = Object.assign({
			count: 4000,        // number of flakes
			width: 50,          // volume size along X
			depth: 50,          // volume size along Z
			height: 40,         // volume size along Y (fall distance)
			fallSpeed: 2.6,     // base fall speed, units per second (slow)
			fallVariance: 0.5,  // ± fraction of fall speed randomised per flake
			wind: [0.6, 0.2],   // gentle horizontal drift [x, z] in units per second
			swayAmp: 0.5,       // horizontal flutter amplitude (world units)
			swayFreq: 1.0,      // flutter speed
			sizeMin: 3,         // base flake size in pixels at the reference depth
			sizeMax: 8,         // base flake size in pixels at the reference depth
			sizeScale: 20,      // reference depth: flakes here keep their base px size;
			                    // nearer flakes grow, farther flakes shrink (perspective)
			maxSize: 64,        // clamp so very near flakes don't explode
			focusDist: 12,      // flakes closer than this start to blur (depth of field)
			focusRange: 10,     // distance over which the near blur ramps in
			color: [1.0, 1.0, 1.0],
			opacity: 0.9,
			followTarget: null, // optional object/camera; volume tracks its x/z
		}, options);

		const n = this.count = opt.count;

		this.snowOpacity = opt.opacity;
		// read by SnowShader for perspective sizing + near blur
		this.sizeScale = opt.sizeScale;
		this.maxSize = opt.maxSize;
		this.focusDist = opt.focusDist;
		this.focusRange = opt.focusRange;
		this.shader = { name: "snow" };
		this.mat.color = opt.color;
		this.castShadow = false;   // flakes must not cast shadows (see Rain)

		// simulation state
		this._px = new Float32Array(n);
		this._py = new Float32Array(n);
		this._pz = new Float32Array(n);
		this._vy = new Float32Array(n);       // fall speed
		this._size = new Float32Array(n);     // flake size (px)
		this._bri = new Float32Array(n);      // brightness
		this._phase = new Float32Array(n);    // sway phase
		this._swayAmp = new Float32Array(n);  // sway amplitude
		this._swayFreq = new Float32Array(n); // sway speed

		this.mesh = new ParticleMesh(n);
		this.addMesh(this.mesh);

		this._lastTime = 0;

		for (let i = 0; i < n; i++) {
			this._spawn(i, true);
		}
		this._writeAll();
	}

	get halfW() { return this.options.width * 0.5; }
	get halfD() { return this.options.depth * 0.5; }
	get halfH() { return this.options.height * 0.5; }

	_rand(a, b) { return a + Math.random() * (b - a); }

	_spawn(i, initial) {
		const o = this.options;
		this._px[i] = this._rand(-this.halfW, this.halfW);
		this._pz[i] = this._rand(-this.halfD, this.halfD);
		this._py[i] = initial ? this._rand(-this.halfH, this.halfH) : this.halfH;
		this._vy[i] = o.fallSpeed * this._rand(1 - o.fallVariance, 1 + o.fallVariance);
		this._size[i] = this._rand(o.sizeMin, o.sizeMax);
		this._bri[i] = this._rand(0.8, 1.0);
		this._phase[i] = this._rand(0, Math.PI * 2);
		this._swayAmp[i] = o.swayAmp * this._rand(0.5, 1.0);
		this._swayFreq[i] = o.swayFreq * this._rand(0.6, 1.4);
	}

	_writeOne(i) {
		const n = this.count;
		const vb = this.mesh.vertexBuffer;
		const c = this.mat.color;
		const b = this._bri[i];
		const sway = Math.sin(this._phase[i]) * this._swayAmp[i];
		// ParticleMesh layout: [positions][colors][sizes]
		vb._t_set(i * 3, this._px[i] + sway, this._py[i], this._pz[i]);
		vb._t_set((n + i) * 3, c[0] * b, c[1] * b, c[2] * b);
		vb._t_set(n * 6 + i, this._size[i]);
	}

	_writeAll() {
		for (let i = 0; i < this.count; i++) this._writeOne(i);
		this.mesh.update();
	}

	update() {
		const now = (typeof performance !== "undefined" ? performance.now() : Date.now());
		let dt = this._lastTime ? (now - this._lastTime) / 1000 : 0.016;
		this._lastTime = now;
		if (dt > 0.05) dt = 0.05;

		const o = this.options;
		const n = this.count;
		const halfH = this.halfH, halfW = this.halfW, halfD = this.halfD;
		const wx = o.wind[0] * dt, wz = o.wind[1] * dt;

		const t = o.followTarget;
		if (t && t.location) {
			this.location.x = t.location.x;
			this.location.z = t.location.z;
		}

		for (let i = 0; i < n; i++) {
			const y = this._py[i] - this._vy[i] * dt;

			if (y < -halfH) {
				this._spawn(i, false);
				continue;
			}

			let x = this._px[i] + wx;
			let z = this._pz[i] + wz;

			if (x > halfW) x -= o.width; else if (x < -halfW) x += o.width;
			if (z > halfD) z -= o.depth; else if (z < -halfD) z += o.depth;

			this._px[i] = x;
			this._py[i] = y;
			this._pz[i] = z;
			this._phase[i] += this._swayFreq[i] * dt;
		}

		this._writeAll();
	}
}
