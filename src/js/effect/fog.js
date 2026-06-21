
import { SceneObject } from "../scene/object.js";
import { PlaneMesh } from "../scene/shapes.js";

// GroundFog — drifting low-lying mist.
//
// A few large horizontal plane "layers" stacked just above the ground, each
// rendered by the procedural "groundfog" shader. The fog pattern is animated
// noise that slowly flows in the wind direction; the stacked layers drift at
// slightly different speeds to give a soft volumetric parallax near the floor.
//
// Usage:
//   const fog = new GroundFog({ size: 80, drift: [0.6, 0.2] });
//   scene.add(fog);                         // add after scene geometry
//   scene.on("frame", () => fog.update());  // animate the flow
//   scene.animation = true;
//
export class GroundFog extends SceneObject {
	constructor(options = {}) {
		super();

		const opt = this.options = Object.assign({
			size: 80,            // horizontal extent of the fog sheet (world units)
			layers: 3,           // stacked planes — more = thicker, softer volume
			baseHeight: 0.4,     // height of the lowest layer
			layerGap: 0.9,       // vertical spacing between layers
			color: [0.62, 0.66, 0.72],
			opacity: 0.5,        // alpha of the lowest layer (upper layers thinner)
			density: 0.55,       // coverage, 0 (wispy) .. 1 (solid)
			noiseScale: 0.045,   // world units -> noise frequency (smaller = larger blobs)
			drift: [0.6, 0.25],  // world units/sec the fog flows toward [x, z]
			followTarget: null,  // optional object/camera; sheet tracks its x/z
		}, options);

		// like rain, fog must never cast shadows (the shadow pass ignores the
		// per-object shader override and would splat flat planes into the map)
		this.castShadow = false;

		this._layers = [];
		const n = opt.layers;

		for (let i = 0; i < n; i++) {
			const t = n > 1 ? i / (n - 1) : 0;   // 0 = bottom .. 1 = top

			const layer = new SceneObject();
			layer.addMesh(new PlaneMesh(1, 1));
			layer.scale.set(opt.size, 1, opt.size);
			layer.location.y = opt.baseHeight + i * opt.layerGap;
			layer.castShadow = false;
			layer.shader = { name: "groundfog" };

			// per-layer shader parameters
			layer.fogColor = opt.color;
			layer.fogOpacity = opt.opacity * (1.0 - 0.45 * t);   // upper layers fade out
			layer.density = opt.density;
			layer.noiseScale = opt.noiseScale;

			// randomised start offsets + per-layer speeds so layers don't move in lockstep
			layer._flow1 = [this._rand(0, 10), this._rand(0, 10)];
			layer._flow2 = [this._rand(0, 10), this._rand(0, 10)];
			layer._speed1 = 1.0 + 0.25 * i;
			layer._speed2 = -0.65 - 0.18 * i;

			this.add(layer);
			this._layers.push(layer);
		}

		this._lastTime = 0;
	}

	_rand(a, b) { return a + Math.random() * (b - a); }

	// Advance the drifting flow. Call once per rendered frame.
	update() {
		const now = (typeof performance !== "undefined" ? performance.now() : Date.now());
		let dt = this._lastTime ? (now - this._lastTime) / 1000 : 0.016;
		this._lastTime = now;
		if (dt > 0.05) dt = 0.05;

		const o = this.options;
		const ns = o.noiseScale;
		// world drift converted into noise-space units (matches base = worldXZ * noiseScale)
		const dx = o.drift[0] * ns, dz = o.drift[1] * ns;

		const target = o.followTarget;
		if (target && target.location) {
			this.location.x = target.location.x;
			this.location.z = target.location.z;
		}

		for (const layer of this._layers) {
			layer._flow1[0] += dx * layer._speed1 * dt;
			layer._flow1[1] += dz * layer._speed1 * dt;
			layer._flow2[0] += dx * layer._speed2 * dt;
			layer._flow2[1] += dz * layer._speed2 * dt;
		}
	}
}
