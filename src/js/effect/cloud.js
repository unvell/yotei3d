
import { ParticleObject } from "../scene/object.js";
import { ParticleMesh } from "../webgl/mesh.js";

// Clouds — a self-contained drifting cloud effect for the sky.
//
// A handful of cloud clusters, each built from many soft fbm-textured puff
// sprites arranged in a flattened ellipsoid. Whole clusters drift slowly with
// the wind and wrap around the volume; every puff also billows gently so the
// clouds feel alive. Puffs near the top of a cluster are lit bright white while
// lower puffs shade to a cool grey, giving a sense of volume. Rendered by the
// "cloud" shader.
//
// Usage:
//   const clouds = new Clouds({ clusters: 8, height: 60 });
//   scene.add(clouds);                           // add after scene geometry
//   scene.on("frame", () => clouds.update());    // drive the drift
//   scene.animation = true;
//
export class Clouds extends ParticleObject {
	constructor(options = {}) {
		super();

		const opt = this.options = Object.assign({
			clusters: 14,            // number of cloud clumps
			puffsPerCluster: 60,     // soft puffs that make up each clump
			width: 360,              // volume size along X (drift wraps here)
			depth: 360,              // volume size along Z
			height: 52,              // average altitude of the cloud layer (Y)
			heightVariance: 12,      // ± altitude spread between clusters
			clusterRadius: 34,       // horizontal half-extent of one cluster
			clusterThickness: 10,    // vertical half-extent of one cluster
			wind: [3.0, 0.7],        // drift velocity [x, z] in units per second
			puffSizeMin: 17,         // puff size; with sizeScale ~800 this reads
			puffSizeMax: 32,         //   roughly as a world-space radius
			sizeScale: 800,          // reference depth for perspective sizing
			maxSize: 2400,           // clamp for very near puffs
			billowAmp: 1.6,          // gentle per-puff bob amplitude (world units)
			billowFreq: 0.3,         // bob speed
			topColor: [1.0, 1.0, 1.0],        // sunlit cloud tops
			bottomColor: [0.70, 0.74, 0.82],  // shaded undersides (cool grey)
			opacity: 0.85,
			followTarget: null,      // optional camera/object; layer tracks its x/z
		}, options);

		const n = this.count = opt.clusters * opt.puffsPerCluster;

		this.cloudOpacity = opt.opacity;
		// read by CloudShader for perspective sizing
		this.sizeScale = opt.sizeScale;
		this.maxSize = opt.maxSize;
		this.shader = { name: "cloud" };
		this.castShadow = false;   // puffs must not cast shadows (see Snow)

		// per-cluster drift state
		this._cx = new Float32Array(opt.clusters);
		this._cy = new Float32Array(opt.clusters);
		this._cz = new Float32Array(opt.clusters);

		// per-puff state
		this._cluster = new Int32Array(n);   // owning cluster index
		this._ox = new Float32Array(n);      // offset from cluster centre
		this._oy = new Float32Array(n);
		this._oz = new Float32Array(n);
		this._size = new Float32Array(n);    // puff size
		this._r = new Float32Array(n);       // pre-shaded colour
		this._g = new Float32Array(n);
		this._b = new Float32Array(n);
		this._phase = new Float32Array(n);   // billow phase

		this.mesh = new ParticleMesh(n);
		this.addMesh(this.mesh);

		this._lastTime = 0;

		for (let ci = 0; ci < opt.clusters; ci++) this._spawnCluster(ci);
		this._writeAll();
	}

	get halfW() { return this.options.width * 0.5; }
	get halfD() { return this.options.depth * 0.5; }

	_rand(a, b) { return a + Math.random() * (b - a); }

	_spawnCluster(ci) {
		const o = this.options;
		this._cx[ci] = this._rand(-this.halfW, this.halfW);
		this._cz[ci] = this._rand(-this.halfD, this.halfD);
		this._cy[ci] = o.height + this._rand(-o.heightVariance, o.heightVariance);

		const base = ci * o.puffsPerCluster;
		for (let j = 0; j < o.puffsPerCluster; j++) {
			const i = base + j;
			this._cluster[i] = ci;

			// distribute puffs in a flattened disc, denser toward the centre
			const ang = this._rand(0, Math.PI * 2);
			const rad = Math.pow(Math.random(), 0.6) * o.clusterRadius;
			this._ox[i] = Math.cos(ang) * rad;
			this._oz[i] = Math.sin(ang) * rad * 0.8;

			// the cloud bulges in the middle and thins toward the rim
			const centreness = 1.0 - rad / o.clusterRadius;
			this._oy[i] = this._rand(-o.clusterThickness, o.clusterThickness) * (0.35 + 0.65 * centreness);

			// bigger puffs in the centre, smaller at the edges
			this._size[i] = this._rand(o.puffSizeMin, o.puffSizeMax) * (0.5 + 0.5 * centreness);

			// shade by height within the cluster: bright tops, cool undersides
			const t = (this._oy[i] / o.clusterThickness) * 0.5 + 0.5;   // 0 bottom .. 1 top
			const tt = t * t;
			this._r[i] = o.bottomColor[0] + (o.topColor[0] - o.bottomColor[0]) * tt;
			this._g[i] = o.bottomColor[1] + (o.topColor[1] - o.bottomColor[1]) * tt;
			this._b[i] = o.bottomColor[2] + (o.topColor[2] - o.bottomColor[2]) * tt;

			this._phase[i] = this._rand(0, Math.PI * 2);
		}
	}

	_writeAll() {
		const n = this.count;
		const vb = this.mesh.vertexBuffer;
		const amp = this.options.billowAmp;
		for (let i = 0; i < n; i++) {
			const ci = this._cluster[i];
			const bob = Math.sin(this._phase[i]) * amp;
			// ParticleMesh layout: [positions][colors][sizes]
			vb._t_set(i * 3, this._cx[ci] + this._ox[i], this._cy[ci] + this._oy[i] + bob, this._cz[ci] + this._oz[i]);
			vb._t_set((n + i) * 3, this._r[i], this._g[i], this._b[i]);
			vb._t_set(n * 6 + i, this._size[i]);
		}
		this.mesh.update();
	}

	update() {
		const now = (typeof performance !== "undefined" ? performance.now() : Date.now());
		let dt = this._lastTime ? (now - this._lastTime) / 1000 : 0.016;
		this._lastTime = now;
		if (dt > 0.05) dt = 0.05;

		const o = this.options;
		const wx = o.wind[0] * dt, wz = o.wind[1] * dt;

		const tgt = o.followTarget;
		if (tgt && tgt.location) {
			this.location.x = tgt.location.x;
			this.location.z = tgt.location.z;
		}

		// drift whole clusters with the wind, wrapping around the volume
		const halfW = this.halfW, halfD = this.halfD;
		for (let ci = 0; ci < o.clusters; ci++) {
			let cx = this._cx[ci] + wx;
			let cz = this._cz[ci] + wz;
			if (cx > halfW) cx -= o.width; else if (cx < -halfW) cx += o.width;
			if (cz > halfD) cz -= o.depth; else if (cz < -halfD) cz += o.depth;
			this._cx[ci] = cx;
			this._cz[ci] = cz;
		}

		// advance the gentle per-puff billow
		const n = this.count;
		const dp = o.billowFreq * dt;
		for (let i = 0; i < n; i++) this._phase[i] += dp;

		this._writeAll();
	}
}
