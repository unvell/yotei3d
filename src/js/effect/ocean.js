
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
			level: 0,             // water plane height (world Y)

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
			reflectionBlur: 2.0,  // distance/grazing reflection softening (0 = mirror-sharp)

			followTarget: null,   // optional object/camera; grid recentres on its x/z
		}, options);

		// expose the live-readable shading/wave params on the object so the
		// shader (which reads obj.options) picks up changes immediately.
		this.time = 0;
		this._lastTime = 0;

		this.shader = { name: "water" };
		this.castShadow = false;
		this.receiveShadow = false;

		this.location.y = opt.level;

		this.mesh = buildGridMesh(opt.size, Math.max(1, Math.floor(opt.segments)));
		this.addMesh(this.mesh);
	}

	update() {
		const now = (typeof performance !== "undefined" ? performance.now() : Date.now());
		let dt = this._lastTime ? (now - this._lastTime) / 1000 : 0.016;
		this._lastTime = now;
		if (dt > 0.05) dt = 0.05;

		this.time += dt * (this.options.timeScale || 1.0);

		const tgt = this.options.followTarget;
		if (tgt && tgt.location) {
			this.location.x = tgt.location.x;
			this.location.z = tgt.location.z;
		}
		this.location.y = this.options.level;
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
