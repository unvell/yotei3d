
import { SceneObject } from "../scene/object.js";
import { Mesh } from "../webgl/mesh.js";

// Ocean — an animated reflective water surface.
//
// A large flat grid whose undulation is computed on the GPU (Gerstner waves in
// water.vert), so the mesh is built once and only a `time` value advances each
// frame. The surface reflects the scene's skybox (reusing the IBL environment
// cubemap — no extra render pass), blends sky against a deep water colour with
// a Fresnel term, and throws a sharp sun glint. Rendered by the "water" shader.
//
// Usage:
//   const ocean = new Ocean({ size: 400, segments: 200 });
//   scene.add(ocean);
//   scene.on("frame", () => ocean.update());   // advance the waves
//   scene.animation = true;
//
// For an endless sea, pass `followTarget: scene.mainCamera` so the grid
// recentres on the camera each frame; waves are evaluated in world space, so
// the surface slides underneath without popping.
export class Ocean extends SceneObject {
	constructor(options = {}) {
		super();

		const opt = this.options = Object.assign({
			size: 400,            // world extent of the water grid (square)
			segments: 200,        // grid resolution per axis (wave detail)
			level: 0,             // initial water plane height (world Y); thereafter
			                      // location.y is authoritative. Assigning a new
			                      // options.level still moves the surface live.

			// wave shape (read live every frame by the water shader)
			wind: [1.0, 0.35],    // primary wave heading [x, z]
			waveAmp: 0.6,         // amplitude of the largest wave
			waveLen: 16.0,        // wavelength of the largest wave
			waveSpeed: 1.0,       // crest travel speed
			steepness: 0.7,       // 0 rolling swell .. 1 sharp choppy crests
			timeScale: 1.0,       // animation speed multiplier

			// shading
			deepColor: [0.015, 0.08, 0.11],
			shallowColor: [0.10, 0.34, 0.38],
			reflectivity: 1.0,
			fresnelPower: 5.0,
			fresnelBias: 0.02,
			sunGlitter: 0.12,     // sun-road width: small = tight glint, large = broad shimmering path
			specStrength: 1.2,    // sun-glitter intensity (HDR; >1 blooms)
			rippleScale: 0.25,
			rippleStrength: 0.35,
			rippleDetail: 1.0,    // near-camera fine ripple octaves: breaks up "oily" close water (0 = off)
			reflectionBlur: 2.0,  // distance/grazing reflection softening (0 = mirror-sharp)

			// Endless-sea follow. Pass an object/camera and the grid recentres on
			// its x/z. The recentre is SNAPPED to a whole grid cell (see update())
			// so the world-space wave lattice always lands on the same phase — the
			// surface never "swims" while it slides. Follow the *subject* that
			// actually travels (a ship/aircraft), never the orbiting camera eye.
			followTarget: null,

			// Ship wake. Pass { source } (any object with .location) to lay a foam
			// trail behind it; the water shader paints turbulent white foam along
			// the path. null = no wake. Tunables (all optional):
			//   dropDistance  world units between trail samples (smaller = smoother)
			//   life          seconds a foam sample lingers before it fades out
			//   maxPoints     hard cap on trail samples (<= shader WAKE_MAX = 48)
			//   width         half-width of the foam at the stern (world units)
			//   widthGrowth   how much wider the foam gets at the tail (× width)
			//   foamColor     [r,g,b] of the foam (slightly >1 blooms)
			//   foamIntensity overall foam opacity
			//   sparkle       sun glints twinkling on the spray (HDR; 0 = off)
			wake: null,

			// Depth-based contact foam — white water wherever solid geometry
			// breaks the surface (the hull's waterline, a shoreline, rocks). The
			// water shader runs a scene depth pre-pass (the ocean excludes itself,
			// since castShadow is false) and foams where that geometry sits just
			// under the surface. Pass { enabled, distance, color, intensity };
			// null/omitted = off. `distance` is how far *below* the waterline (world
			// Y units) the foam fades out — a vertical band, so it stays a thin
			// waterline at any view angle and converges at the bow instead of
			// smearing forward.
			contactFoam: null,
		}, options);

		// expose the live-readable shading/wave params on the object so the
		// shader (which reads obj.options) picks up changes immediately.
		this.time = 0;
		this._lastTime = 0;

		// rolling buffer of recent wake samples ({ x, z, age } in world space,
		// oldest first); fed to the water shader each frame. See _updateWake().
		this._wake = [];

		this.shader = { name: "water" };
		this.castShadow = false;
		this.receiveShadow = false;

		this.location.y = opt.level;
		this._appliedLevel = opt.level;

		this.mesh = buildGridMesh(opt.size, Math.max(1, Math.floor(opt.segments)));
		this.addMesh(this.mesh);
	}

	update() {
		const now = (typeof performance !== "undefined" ? performance.now() : Date.now());
		let dt = this._lastTime ? (now - this._lastTime) / 1000 : 0.016;
		this._lastTime = now;
		if (dt > 0.05) dt = 0.05;

		this.time += dt * (this.options.timeScale || 1.0);

		// Follow, snapped to a whole grid cell. The waves are evaluated in world
		// space, so if the grid slid by arbitrary sub-cell amounts its vertex
		// lattice would sample the wave field at shifting phases and the surface
		// would "swim". Quantising location.x/z to the cell size keeps every
		// vertex on the same world lattice, so the grid can chase the subject
		// across an endless sea with the waves dead-still relative to the world.
		const tgt = this.options.followTarget;
		if (tgt && tgt.location) {
			const seg = Math.max(1, Math.floor(this.options.segments));
			const cell = this.options.size / seg;
			this.location.x = Math.round(tgt.location.x / cell) * cell;
			this.location.z = Math.round(tgt.location.z / cell) * cell;
		}

		// Height is driven by location.y so `ocean.location.set(...)` sticks.
		// `level` stays a live knob: only push it into location.y when the caller
		// actually changes it, instead of clobbering location every frame.
		if (this.options.level !== this._appliedLevel) {
			this.location.y = this.options.level;
			this._appliedLevel = this.options.level;
		}

		this._updateWake(dt);
	}

	// Maintain the rolling wake trail: age existing samples, retire the ones
	// past their lifetime, and drop a fresh sample at the source once it has
	// moved `dropDistance`. The water shader reads this._wake to paint foam.
	_updateWake(dt) {
		const cfg = this.options.wake;
		const w = this._wake;

		if (!cfg || !cfg.source || !cfg.source.location) {
			if (w.length) w.length = 0;   // wake turned off → clear the trail
			return;
		}

		const life = cfg.life || 14;
		const drop = cfg.dropDistance || 6;
		const maxPoints = Math.min(cfg.maxPoints || 48, 48);   // shader WAKE_MAX

		for (let i = 0; i < w.length; i++) w[i].age += dt;
		while (w.length && w[0].age > life) w.shift();          // retire old foam

		const src = cfg.source.location;
		const head = w.length ? w[w.length - 1] : null;
		const dx = head ? src.x - head.x : Infinity;
		const dz = head ? src.z - head.z : Infinity;
		if (!head || (dx * dx + dz * dz) >= drop * drop) {
			w.push({ x: src.x, z: src.z, age: 0 });
			if (w.length > maxPoints) w.shift();
		}
	}
}

// A flat XZ grid centred on the origin, sized `size` × `size`, with
// `segments` quads per axis. Triangulated and indexed; normals are all up
// (the real surface normal is produced per-vertex in the wave shader).
function buildGridMesh(size, segments) {
	const gw = segments + 1;
	const half = size * 0.5;
	const vertexCount = gw * gw;

	const vertices = new Array(vertexCount * 3);
	const normals = new Array(vertexCount * 3);
	const texcoords = new Array(vertexCount * 2);

	for (let j = 0; j < gw; j++) {
		const tz = j / segments;
		const z = -half + tz * size;
		for (let i = 0; i < gw; i++) {
			const tx = i / segments;
			const x = -half + tx * size;
			const gi = j * gw + i;

			vertices[gi * 3] = x;
			vertices[gi * 3 + 1] = 0;
			vertices[gi * 3 + 2] = z;

			normals[gi * 3] = 0;
			normals[gi * 3 + 1] = 1;
			normals[gi * 3 + 2] = 0;

			texcoords[gi * 2] = tx;
			texcoords[gi * 2 + 1] = tz;
		}
	}

	const indexes = new Array(segments * segments * 6);
	let p = 0;
	for (let j = 0; j < segments; j++) {
		for (let i = 0; i < segments; i++) {
			const a = j * gw + i;
			const b = a + 1;
			const c = a + gw;
			const d = c + 1;
			indexes[p++] = a; indexes[p++] = c; indexes[p++] = b;
			indexes[p++] = b; indexes[p++] = c; indexes[p++] = d;
		}
	}

	const mesh = new Mesh();
	mesh.vertices = vertices;
	mesh.normals = normals;
	mesh.texcoords = texcoords;
	mesh.indexes = indexes;
	mesh.indexed = true;

	mesh.meta = {
		vertexCount,
		normalCount: vertexCount,
		texcoordCount: vertexCount,
		indexCount: indexes.length,
		tangentBasisCount: 0,
		uvCount: 1,
	};

	mesh.composeMode = Mesh.ComposeModes.Triangles;
	mesh.updateBuffer();

	return mesh;
}
