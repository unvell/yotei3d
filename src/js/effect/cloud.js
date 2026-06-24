
import { ParticleObject, SceneObject } from "../scene/object.js";
import { ParticleMesh } from "../webgl/mesh.js";
import { PlaneMesh } from "../scene/shapes.js";
import { Vec4 } from "@/math";

function smoothstep(a, b, x) {
	const t = Math.min(Math.max((x - a) / (b - a), 0), 1);
	return t * t * (3 - 2 * t);
}

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
			selfShadow: 0.3,         // extra darkening of the undersides (0..1) so the
			                         //   cloud reads as a lit, solid volume
			opacity: 0.85,
			fadeMargin: 0.28,        // outer fraction of the volume over which puffs
			                         //   fade out, so drifting clusters ease in/out
			                         //   at the edges instead of popping (0 disables)
			fadeIn: 3.0,             // seconds to ramp the whole layer up from nothing
			                         //   on first update, so it doesn't appear all at
			                         //   once (0 = appear immediately)
			// simple cast shadow: a soft dark blob on the ground per cluster,
			// drifting with the wind (see the "cloudshadow" shader)
			groundShadow: false,     // enable the ground shadow
			shadowY: 0.2,            // flat ground: the blob's world height. with a
			                         //   groundTarget: how far the blob floats above
			                         //   the sampled surface.
			groundTarget: null,      // optional object with getHeightAt(x,z) (e.g. a
			                         //   Terrain) so shadows follow an uneven surface
			                         //   instead of sitting at a fixed height
			shadowStrength: 0.3,     // peak shadow opacity
			shadowScale: 1.6,        // shadow radius relative to clusterRadius
			shadowColor: [0.05, 0.07, 0.10],
			followTarget: null,      // optional camera/object; layer tracks its x/z
		}, options);

		const n = this.count = opt.clusters * opt.puffsPerCluster;

		this.cloudOpacity = opt.fadeIn > 0 ? 0 : opt.opacity;
		// read by CloudShader for perspective sizing
		this.sizeScale = opt.sizeScale;
		this.maxSize = opt.maxSize;
		// read by CloudShader for the soft edge fade
		this.fadeMargin = opt.fadeMargin;
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
		this._age = 0;   // seconds since the first update(), drives the fade-in
		this._shadowPlanes = [];
		this._shadowMesh = null;

		for (let ci = 0; ci < opt.clusters; ci++) this._spawnCluster(ci);
		this._writeAll();
		this._buildShadows();
	}

	get halfW() { return this.options.width * 0.5; }
	get halfD() { return this.options.depth * 0.5; }

	// Re-merge options and regenerate the cloud field in place. Cheap params
	// (opacity, wind, fadeMargin) are read live every frame, so for those you
	// can just set them on `clouds.options` directly; call rebuild() only for
	// structural changes (cluster/puff counts, sizes, radius, height, colours).
	// Used by the live tuning panel in the clouds example.
	rebuild(options = {}) {
		const o = this.options = Object.assign(this.options, options);
		const n = o.clusters * o.puffsPerCluster;

		// live-readable params
		this.cloudOpacity = o.opacity;
		this.sizeScale = o.sizeScale;
		this.maxSize = o.maxSize;
		this.fadeMargin = o.fadeMargin;

		if (o.clusters !== this._cx.length) {
			this._cx = new Float32Array(o.clusters);
			this._cy = new Float32Array(o.clusters);
			this._cz = new Float32Array(o.clusters);
		}

		if (n !== this.count) {
			this.count = n;
			this._cluster = new Int32Array(n);
			this._ox = new Float32Array(n);
			this._oy = new Float32Array(n);
			this._oz = new Float32Array(n);
			this._size = new Float32Array(n);
			this._r = new Float32Array(n);
			this._g = new Float32Array(n);
			this._b = new Float32Array(n);
			this._phase = new Float32Array(n);

			// swap in a right-sized particle mesh (drop the old one)
			this.removeMesh(this.mesh);
			this.mesh = new ParticleMesh(n);
			this.addMesh(this.mesh);
		}

		for (let ci = 0; ci < o.clusters; ci++) this._spawnCluster(ci);
		this._writeAll();
		this._buildShadows();
	}

	// ---- ground shadow blobs (one flat quad per cluster) --------------------

	_buildShadows() {
		this._destroyShadows();
		const o = this.options;
		if (!o.groundShadow) return;
		if (!this._shadowMesh) this._shadowMesh = new PlaneMesh(1, 1);
		for (let ci = 0; ci < o.clusters; ci++) {
			const p = new SceneObject();
			p.addMesh(this._shadowMesh);     // all blobs share one unit quad
			p.shader = { name: "cloudshadow" };
			p.castShadow = false;
			p.shadowColor = o.shadowColor;
			p.shadowSeed = Math.random() * 10;
			p.shadowOpacity = 0;
			this.add(p);
			this._shadowPlanes.push(p);
		}
	}

	_destroyShadows() {
		for (const p of this._shadowPlanes) this.remove(p);
		this._shadowPlanes = [];
	}

	_updateShadows() {
		const planes = this._shadowPlanes;
		if (planes.length === 0) return;
		const o = this.options;
		const halfW = this.halfW, halfD = this.halfD, margin = o.fadeMargin;
		const rad = o.clusterRadius * o.shadowScale;
		// match the layer fade-in (cloudOpacity ramps from 0 to opacity)
		const fadeIn = o.opacity > 0 ? this.cloudOpacity / o.opacity : 1;

		// optionally snap each blob onto an uneven ground (e.g. a Terrain) so it
		// isn't buried under hills; otherwise sit at the fixed shadowY height
		const g = o.groundTarget;
		const sample = g && typeof g.getHeightAt === "function";
		const gx = sample && g.location ? g.location.x : 0;
		const gy = sample && g.location ? g.location.y : 0;
		const gz = sample && g.location ? g.location.z : 0;

		for (let ci = 0; ci < planes.length; ci++) {
			const p = planes[ci];
			const cx = this._cx[ci], cz = this._cz[ci];
			// world XZ of the cluster, then the ground height under it
			const wx = this.location.x + cx, wz = this.location.z + cz;
			const surfaceY = sample ? g.getHeightAt(wx - gx, wz - gz) + gy + o.shadowY : o.shadowY;
			p.location.set(cx, surfaceY - this.location.y, cz);
			p.scale.set(rad, 1, rad);
			// fade toward the volume rim, same as the cloud puffs
			const e = Math.max(Math.abs(cx) / halfW, Math.abs(cz) / halfD);
			const fade = margin > 0 ? 1 - smoothstep(1 - margin, 1, e) : 1;
			p.shadowColor = o.shadowColor;
			p.shadowOpacity = o.shadowStrength * fade * fadeIn;
		}
	}

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

			// shade by height within the cluster: bright tops, cool undersides.
			// selfShadow deepens the underside so the cloud reads as a lit volume.
			const t = (this._oy[i] / o.clusterThickness) * 0.5 + 0.5;   // 0 bottom .. 1 top
			const tt = t * t;
			const sh = 1.0 - o.selfShadow * 0.55;   // darken the bottom colour
			const b0 = o.bottomColor[0] * sh, b1 = o.bottomColor[1] * sh, b2 = o.bottomColor[2] * sh;
			this._r[i] = b0 + (o.topColor[0] - b0) * tt;
			this._g[i] = b1 + (o.topColor[1] - b1) * tt;
			this._b[i] = b2 + (o.topColor[2] - b2) * tt;

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

		// ease the whole layer in on first appearance instead of popping in
		if (o.fadeIn > 0) {
			this._age += dt;
			this.cloudOpacity = o.opacity * smoothstep(0, o.fadeIn, this._age);
		}

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
		this._updateShadows();
	}

	// Provide soft, volumetric occluders for the VolumetricLight (god-ray) effect
	// so the sun's shafts filter through the gaps in the cloud field:
	//
	//   const rays = new VolumetricLight(scene, { follow: scene.sun,
	//                                             softOccluders: [clouds] });
	//
	// Reports one fuzzy disc per *cluster* (cheap — clusters, not puffs), in
	// world space, sized to the cluster and faded at the volume rim to match the
	// drifting puffs. `cb(x, y, z, radius, alpha)`.
	forEachVolumetricOccluder(cb, opts = {}) {
		const o = this.options;
		const m = this._transform;
		if (!m) return;

		const radiusScale = (typeof opts.radiusScale === "number") ? opts.radiusScale : 1.25;
		const r = o.clusterRadius * radiusScale;
		const fade = o.fadeMargin || 0;
		const halfW = this.halfW, halfD = this.halfD;
		const baseAlpha = this.cloudOpacity;   // tracks live opacity + fade-in

		if (baseAlpha <= 0) return;

		for (let ci = 0; ci < o.clusters; ci++) {
			const cx = this._cx[ci], cy = this._cy[ci], cz = this._cz[ci];

			// match the puff edge-fade so clusters ease in/out at the rim
			let edge = 1;
			if (fade > 0) {
				const e = Math.max(Math.abs(cx) / halfW, Math.abs(cz) / halfD);
				edge = 1 - smoothstep(1 - fade, 1, e);
			}
			if (edge <= 0) continue;

			const w = new Vec4(cx, cy, cz, 1).mulMat(m);
			cb(w.x, w.y, w.z, r, baseAlpha * edge);
		}
	}
}
