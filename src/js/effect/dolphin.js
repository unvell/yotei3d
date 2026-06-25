
import { SceneObject } from "../scene/object.js";
import { Mesh } from "../webgl/mesh.js";

// Dolphin — a fully procedural leaping dolphin (no model file required).
//
// The body is a swept tube along the local +X axis (nose at +X, tail at -X):
// a circular cross-section whose radius follows a dolphin profile — a pointed
// beak, a bulbous melon/forehead, a thick midbody, and a laterally-compressed
// tail stock. A dorsal fin, two pectoral flippers and the horizontal tail flukes
// are added as thin double-sided blades. Everything uses the standard PBR shader,
// so the dolphin catches the sun and reflects the sky like the rest of the scene.
//
// A built-in ballistic leap drives the motion: each cycle the dolphin arcs out of
// the water along a parabola, pitching to stay tangent to its path (nose-up on the
// way out, nose-down on entry), then waits submerged (hidden under the opaque
// water) until the next leap.
//
//   const dolphin = new Dolphin({ length: 4, leap: { z: 18, height: 6, period: 7 } });
//   scene.add(dolphin);
//   scene.on("frame", () => dolphin.update());
//
// All leaps travel along +X (left → right on a camera looking down -Z), so the
// dolphin is seen broadside — the classic side-on leap. Vary `leap.z` / `length`
// / `height` / `period` / `phase` across a few instances to make a lively pod.
export class Dolphin extends SceneObject {
	constructor(options = {}) {
		super();

		const opt = this.options = Object.assign({
			length: 4.0,       // nose-to-tail body length (world units)
			sides: 20,         // cross-section resolution
			segments: 72,      // resolution along the body
			color: [0.085, 0.10, 0.125],   // dark blue-grey dolphin skin
			roughness: 0.45,               // wet skin: a soft sheen, not a mirror
			metallic: 0.0,
		}, options);

		// ballistic leap parameters (see update()).
		this.leap = Object.assign({
			level: 0,        // water surface height (world Y)
			height: 6.0,     // peak height above the water
			span: 24.0,      // horizontal distance travelled while airborne
			airTime: 1.6,    // seconds spent above the water
			period: 7.0,     // seconds for a full leap cycle (air + submerged wait)
			phase: 0.0,      // time offset, to stagger a pod
			x: 0.0,          // centre of the arc along X
			z: 0.0,          // depth of the arc (constant during a leap)
			submerge: 9.0,   // how deep it waits between leaps
			diveAngle: -78,  // body pitch while submerged (nose-down)
		}, options.leap);

		this.mat.color = opt.color.slice();
		this.mat.roughness = opt.roughness;
		this.mat.metallic = opt.metallic;

		this.castShadow = false;
		this.receiveShadow = false;

		this._buildBody();
		this._buildFins();

		this._last = 0;
		this._clock = 0;
		this.update();   // place it before the first frame
	}

	_buildBody() {
		const L = this.options.length;
		const halfL = L * 0.5;
		const N = Math.max(8, Math.floor(this.options.segments));
		const M = Math.max(6, Math.floor(this.options.sides));

		const verts = [];
		const norms = [];
		const uvs = [];
		const idx = [];
		const ringAxis = [];   // spine point per ring, for the outward-normal check

		for (let i = 0; i <= N; i++) {
			const t = i / N;
			const ax = halfL * (1.0 - 2.0 * t);
			const ay = spineY(t, L);
			ringAxis.push([ax, ay, 0]);

			const r = bodyRadius(t, L);
			const sx = widthScale(t);
			const sy = heightScale(t);

			for (let j = 0; j < M; j++) {
				const phi = (j / M) * Math.PI * 2.0;   // 0 = +Z side, PI/2 = top (+Y)
				const oy = r * sy * Math.sin(phi);
				const oz = r * sx * Math.cos(phi);
				verts.push(ax, ay + oy, oz);
				norms.push(0, 0, 0);   // accumulated below
				uvs.push(t, j / M);
			}
		}

		// triangles between consecutive rings (winding fixed after the fact)
		for (let i = 0; i < N; i++) {
			for (let j = 0; j < M; j++) {
				const j1 = (j + 1) % M;
				const a = i * M + j;
				const b = i * M + j1;
				const c = (i + 1) * M + j;
				const d = (i + 1) * M + j1;
				idx.push(a, c, b, b, c, d);
			}
		}

		computeSmoothNormals(verts, norms, idx);

		// Orient outward and fix culling: compare each vertex normal against the
		// radial direction from the spine. If the mesh came out inside-out, flip
		// every triangle's winding and negate the normals in one pass.
		let dotSum = 0;
		for (let i = 0; i <= N; i++) {
			const ax = ringAxis[i];
			for (let j = 0; j < M; j++) {
				const k = (i * M + j) * 3;
				const rx = verts[k] - ax[0];
				const ry = verts[k + 1] - ax[1];
				const rz = verts[k + 2] - ax[2];
				const rl = Math.hypot(rx, ry, rz) || 1;
				dotSum += (norms[k] * rx + norms[k + 1] * ry + norms[k + 2] * rz) / rl;
			}
		}
		if (dotSum < 0) {
			for (let i = 0; i < idx.length; i += 3) {
				const tmp = idx[i + 1]; idx[i + 1] = idx[i + 2]; idx[i + 2] = tmp;
			}
			for (let i = 0; i < norms.length; i++) norms[i] = -norms[i];
		}

		this.addMesh(makeMesh(verts, norms, uvs, idx));
	}

	_buildFins() {
		const L = this.options.length;
		const halfL = L * 0.5;
		const verts = [], norms = [], uvs = [], idx = [];

		const top = (t) => [
			halfL * (1.0 - 2.0 * t),
			spineY(t, L) + bodyRadius(t, L) * heightScale(t),
			0,
		];
		const xAt = (t) => halfL * (1.0 - 2.0 * t);

		// dorsal fin: a small backward-curved blade rising from the mid-back
		const dF = top(0.37), dB = top(0.47);
		const dTipY = spineY(0.41, L) + bodyRadius(0.41, L) * heightScale(0.41) + 0.105 * L;
		pushBlade(verts, norms, uvs, idx, [dF, dB, [xAt(0.53), dTipY, 0]]);

		// pectoral flippers: one each side, swept down-and-back from the flank
		for (const s of [1, -1]) {
			const t = 0.30;
			const ax = xAt(t), ay = spineY(t, L), r = bodyRadius(t, L), sx = widthScale(t);
			const root1 = [ax + 0.02 * L, ay - 0.20 * r, s * sx * r * 0.85];
			const root2 = [ax - 0.06 * L, ay - 0.38 * r, s * sx * r * 0.70];
			const tip   = [ax - 0.16 * L, ay - 0.10 * r - 0.05 * L, s * (sx * r + 0.11 * L)];
			pushBlade(verts, norms, uvs, idx, [root1, root2, tip]);
		}

		// tail flukes: a horizontal two-lobed blade with a small upward dihedral
		const tx = xAt(1.0), ty = spineY(1.0, L);
		const base  = [tx + 0.04 * L, ty, 0];
		const notch = [tx - 0.02 * L, ty, 0];
		const tipR  = [tx - 0.06 * L, ty + 0.02 * L,  0.18 * L];
		const tipL  = [tx - 0.06 * L, ty + 0.02 * L, -0.18 * L];
		pushBlade(verts, norms, uvs, idx, [base, tipR, notch]);
		pushBlade(verts, norms, uvs, idx, [base, notch, tipL]);

		this.addMesh(makeMesh(verts, norms, uvs, idx));
	}

	// Advance the leap. Drives location + pitch from a parabolic arc; between
	// leaps the dolphin sits submerged where the opaque water hides it.
	update() {
		const now = (typeof performance !== "undefined" ? performance.now() : Date.now());
		let dt = this._last ? (now - this._last) / 1000 : 0.016;
		this._last = now;
		if (dt > 0.05) dt = 0.05;
		this._clock += dt;

		const lp = this.leap;
		const cycle = ((this._clock + lp.phase) % lp.period + lp.period) % lp.period;

		if (cycle < lp.airTime) {
			const u = cycle / lp.airTime;                 // 0 at launch .. 1 at entry
			const x = lp.x + (u - 0.5) * lp.span;
			const y = lp.level + 4.0 * lp.height * u * (1.0 - u);
			// velocity, for a tangent (nose-leading) pitch
			const vx = lp.span / lp.airTime;
			const vy = 4.0 * lp.height * (1.0 - 2.0 * u) / lp.airTime;
			const pitch = Math.atan2(vy, vx) * 180 / Math.PI;
			this.location.set(x, y, lp.z);
			this.angle.set(0, 0, pitch);
		} else {
			// waiting underwater at the launch point, nosed down ready to surface
			this.location.set(lp.x - 0.5 * lp.span, lp.level - lp.submerge, lp.z);
			this.angle.set(0, 0, lp.diveAngle);
		}
	}
}

// --- body profile ---------------------------------------------------------
// All return values are in world units (radius) or unitless scales, as a
// function of t ∈ [0,1] from nose (0) to tail (1).

function bodyRadius(t, L) {
	const taper = 1.0 - smoothstep(0.62, 0.97, t);            // thin toward the tail
	// main body girth: swells in behind the head, peaks ~1/3 back, then tapers
	let r = 0.092 * smoothstep(0.09, 0.32, t) * taper;
	// rounded forehead melon just behind the beak
	r += 0.034 * Math.exp(-Math.pow((t - 0.20) / 0.10, 2.0)) * taper;
	// slim beak / rostrum poking out the front
	r = Math.max(r, 0.020 * smoothstep(0.0, 0.03, t) * (1.0 - smoothstep(0.05, 0.13, t)));
	// slim tail stock for the flukes to attach to
	r = Math.max(r, 0.013 * (1.0 - smoothstep(0.90, 1.0, t)) * smoothstep(0.55, 0.72, t));
	return Math.max(r, 0.004) * L;   // tiny floor avoids a degenerate nose ring
}

function widthScale(t)  { return lerp(1.0, 0.42, smoothstep(0.58, 1.0, t)); }  // compress the tail laterally
function heightScale(t) { return lerp(1.07, 1.0, smoothstep(0.0, 0.30, t)); }  // head a touch taller than wide
function spineY(t, L)   { return Math.sin(Math.PI * t) * 0.02 * L; }            // gentle leaping arch

// --- mesh helpers ---------------------------------------------------------

// A thin double-sided blade from a triangle fan of points. Front and back faces
// are emitted with opposite winding and opposite normals (and duplicated verts),
// so the fin is lit correctly and visible from either side regardless of culling.
function pushBlade(verts, norms, uvs, idx, poly) {
	const fn = faceNormal(poly[0], poly[1], poly[2]);

	const front = verts.length / 3;
	for (const p of poly) { verts.push(p[0], p[1], p[2]); norms.push(fn[0], fn[1], fn[2]); uvs.push(0, 0); }
	for (let k = 1; k < poly.length - 1; k++) idx.push(front, front + k, front + k + 1);

	const back = verts.length / 3;
	for (const p of poly) { verts.push(p[0], p[1], p[2]); norms.push(-fn[0], -fn[1], -fn[2]); uvs.push(0, 0); }
	for (let k = 1; k < poly.length - 1; k++) idx.push(back, back + k + 1, back + k);
}

function faceNormal(a, b, c) {
	const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
	const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
	const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
	const l = Math.hypot(nx, ny, nz) || 1;
	return [nx / l, ny / l, nz / l];
}

// Area-weighted smooth vertex normals from an indexed triangle list. `norms`
// must already be sized to `verts` and zeroed; it is filled in place.
function computeSmoothNormals(verts, norms, idx) {
	for (let i = 0; i < idx.length; i += 3) {
		const a = idx[i] * 3, b = idx[i + 1] * 3, c = idx[i + 2] * 3;
		const ux = verts[b] - verts[a], uy = verts[b + 1] - verts[a + 1], uz = verts[b + 2] - verts[a + 2];
		const vx = verts[c] - verts[a], vy = verts[c + 1] - verts[a + 1], vz = verts[c + 2] - verts[a + 2];
		const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
		norms[a] += nx; norms[a + 1] += ny; norms[a + 2] += nz;
		norms[b] += nx; norms[b + 1] += ny; norms[b + 2] += nz;
		norms[c] += nx; norms[c + 1] += ny; norms[c + 2] += nz;
	}
	for (let i = 0; i < norms.length; i += 3) {
		const l = Math.hypot(norms[i], norms[i + 1], norms[i + 2]) || 1;
		norms[i] /= l; norms[i + 1] /= l; norms[i + 2] /= l;
	}
}

function makeMesh(verts, norms, uvs, idx) {
	const mesh = new Mesh();
	mesh.vertices = verts;
	mesh.normals = norms;
	mesh.texcoords = uvs;
	mesh.indexes = idx;
	mesh.indexed = true;
	mesh.meta = {
		vertexCount: verts.length / 3,
		normalCount: norms.length / 3,
		texcoordCount: uvs.length / 2,
		indexCount: idx.length,
		tangentBasisCount: 0,
		uvCount: 1,
	};
	mesh.composeMode = Mesh.ComposeModes.Triangles;
	mesh.updateBuffer();
	return mesh;
}

function smoothstep(e0, e1, x) {
	const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
	return t * t * (3.0 - 2.0 * t);
}
function lerp(a, b, t) { return a + (b - a) * t; }
