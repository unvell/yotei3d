
// LightningFlash — random lightning flashes for an outdoor/storm scene.
//
// Not a shader: it briefly boosts the sun light colour and the sky (clear)
// colour on a flicker envelope, so the whole scene lights up for a moment the
// way distant lightning illuminates clouds and surfaces. Strikes fire at random
// intervals, each as 1-3 quick decaying sub-flashes.
//
// Usage:
//   const lightning = new LightningFlash(scene, { minInterval: 4, maxInterval: 10 });
//   scene.on("frame", () => lightning.update());
//   scene.animation = true;
//
export class LightningFlash {
	constructor(scene, options = {}) {
		this.scene = scene;
		this.renderer = scene.renderer;

		const opt = this.options = Object.assign({
			color: [0.62, 0.72, 1.0],  // cool blue-white flash
			sunBoost: 3.2,             // peak amount added to the sun light
			skyBoost: 0.85,            // peak amount added to the sky colour
			minInterval: 4,            // seconds between strikes (min)
			maxInterval: 11,           // seconds between strikes (max)
		}, options);

		// remember the resting values so each frame can restore towards them
		const sc = scene.sun && scene.sun.mat && scene.sun.mat.color;
		this._baseSun = this._readColor(sc, [1.0, 0.97, 0.94]);
		const bc = this.renderer.options.backColor;
		this._baseSky = [bc.r, bc.g, bc.b];

		this._lastTime = 0;
		this._wait = this._rand(opt.minInterval, opt.maxInterval);
		this._spikes = null;
		this._elapsed = 0;
		this._duration = 0;
	}

	_rand(a, b) { return a + Math.random() * (b - a); }

	_readColor(c, fallback) {
		if (Array.isArray(c)) return [c[0], c[1], c[2]];
		if (c && typeof c === "object") return [c.r, c.g, c.b];
		return fallback.slice();
	}

	// Trigger a flash right now (also called automatically on the timer).
	strike() {
		const n = 1 + Math.floor(Math.random() * 3);   // 1..3 sub-flashes
		const spikes = [];
		let t = 0;
		for (let i = 0; i < n; i++) {
			spikes.push({
				t,
				amp: 0.55 + Math.random() * 0.45,
				decay: 0.05 + Math.random() * 0.11,        // seconds
			});
			t += 0.04 + Math.random() * 0.13;            // gap before next sub-flash
		}
		this._spikes = spikes;
		this._elapsed = 0;
		this._duration = t + 0.35;                       // let the last spike fade out
	}

	_intensity() {
		let v = 0;
		for (const s of this._spikes) {
			const dt = this._elapsed - s.t;
			if (dt >= 0) v = Math.max(v, s.amp * Math.exp(-dt / s.decay));
		}
		return v;
	}

	update() {
		const now = (typeof performance !== "undefined" ? performance.now() : Date.now());
		let dt = this._lastTime ? (now - this._lastTime) / 1000 : 0.016;
		this._lastTime = now;
		if (dt > 0.05) dt = 0.05;

		let intensity = 0;

		if (this._spikes) {
			this._elapsed += dt;
			intensity = this._intensity();
			if (this._elapsed >= this._duration) {
				this._spikes = null;
			}
		} else {
			this._wait -= dt;
			if (this._wait <= 0) {
				this.strike();
				this._wait = this._rand(this.options.minInterval, this.options.maxInterval);
			}
		}

		this._apply(intensity);
	}

	_apply(k) {
		const o = this.options, c = o.color;

		// sun light = base + flash
		const sun = this.scene.sun && this.scene.sun.mat && this.scene.sun.mat.color;
		if (sun) {
			const sb = k * o.sunBoost;
			const r = this._baseSun[0] + c[0] * sb;
			const g = this._baseSun[1] + c[1] * sb;
			const b = this._baseSun[2] + c[2] * sb;
			if (Array.isArray(sun)) { sun[0] = r; sun[1] = g; sun[2] = b; }
			else { sun.r = r; sun.g = g; sun.b = b; }
		}

		// sky / clear colour = base + flash (clamped)
		const bc = this.renderer.options.backColor;
		const kb = k * o.skyBoost;
		bc.r = Math.min(1, this._baseSky[0] + c[0] * kb);
		bc.g = Math.min(1, this._baseSky[1] + c[1] * kb);
		bc.b = Math.min(1, this._baseSky[2] + c[2] * kb);

		this.scene.requireUpdateFrame();
	}
}
