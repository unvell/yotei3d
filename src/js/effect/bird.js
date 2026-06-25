
import { SceneObject } from "../scene/object.js";
import { Mesh } from "../webgl/mesh.js";

// Seabird — a fully procedural flying gull (no model required).
//
// A slim body (spindle along local +X, nose at +X) with two wings built as thin
// double-sided membranes attached as child objects at the shoulders. The wings
// flap by rotating about the body's forward axis, so no per-frame vertex upload
// is needed — just two child angles. Rendered with the standard PBR shader.
//
// A built-in glide wheels the bird around a slow horizontal circle, yawing to
// face its heading with a gentle vertical bob, so a few of them read as gulls
// wheeling over the sea. Pass `glide.followTarget` to keep the circle centred
// on a moving camera.
//
//   const bird = new Seabird({ wingSpan: 5, glide: { center: [0, 30, -120], radius: 30 } });
//   scene.add(bird);
//   scene.on("frame", () => bird.update());
export class Seabird extends SceneObject {
	constructor(options = {}) {
		super();

		const opt = this.options = Object.assign({
			wingSpan: 4.5,      // tip-to-tip
			bodyLen: 1.4,
			color: [0.16, 0.17, 0.20],      // body (dark — reads as a backlit silhouette)
			wingColor: [0.20, 0.21, 0.24],
			roughness: 0.6,
			flapAmp: 34,        // wing-beat amplitude (degrees)
			flapFreq: 2.6,      // wing-beats per second
			flapPhase: 0,       // beat offset, to desync a flock
			glide: undefined,   // see below
		}, options);

		this.glide = Object.assign({
			center: [0, 30, 0], // circle centre [x,y,z] (offset from followTarget if set)
			radius: 35,
			speed: 0.22,        // angular speed around the circle (rad/sec)
			phase: 0,           // starting angle around the circle
			dir: 1,             // 1 = counter-clockwise, -1 = clockwise
			bob: 1.2,           // vertical bob amplitude
			bobFreq: 0.6,       // bobs per second
			followTarget: null, // optional object/camera; centre tracks its x/z
		}, options.glide);

		this.mat.color = opt.color.slice();
		this.mat.roughness = opt.roughness;
		this.mat.metallic = 0;
		this.castShadow = false;
		this.receiveShadow = false;

		this._buildBody();
		// wings as children so flapping is a child rotation about the body's +X
		this.wingPosZ = this._makeWing(+1);   // wing on the +Z side
		this.wingNegZ = this._makeWing(-1);   // wing on the -Z side
		this.add(this.wingPosZ);
		this.add(this.wingNegZ);

		this._last = 0;
		this._clock = 0;
		this.update();
	}

	_buildBody() {
		const L = this.options.bodyLen;
		const halfL = L * 0.5;
		const N = 14, M = 8;
		const verts = [], norms = [], uvs = [], idx = [], ringAxis = [];

		for (let i = 0; i <= N; i++) {
			const t = i / N;
			const ax = halfL * (1.0 - 2.0 * t);
			ringAxis.push([ax, 0, 0]);
			// slim spindle: pointed nose/tail, gentle belly
			const r = Math.max(0.004, 0.11 * Math.pow(Math.sin(t * Math.PI), 0.7)) * L;
			for (let j = 0; j < M; j++) {
				const phi = (j / M) * Math.PI * 2;
				verts.push(ax, r * Math.sin(phi), r * Math.cos(phi));
				norms.push(0, 0, 0);
				uvs.push(t, j / M);
			}
		}
		for (let i = 0; i < N; i++) {
			for (let j = 0; j < M; j++) {
				const j1 = (j + 1) % M;
				const a = i * M + j, b = i * M + j1, c = (i + 1) * M + j, d = (i + 1) * M + j1;
				idx.push(a, c, b, b, c, d);
			}
		}
		computeSmoothNormals(verts, norms, idx);
		orientOutward(verts, norms, idx, ringAxis, M, N);
		this.addMesh(makeMesh(verts, norms, uvs, idx));
	}

	// One wing as a child object: a thin swept, double-sided membrane on the
	// `side` (+1 = +Z, -1 = -Z) of the body, with a gentle baked arch so it reads
	// as a gull even when held flat. Local origin is the shoulder (body centre).
	_makeWing(side) {
		const o = this.options;
		const W = o.wingSpan * 0.5;             // one wing's length
		const chordRoot = o.bodyLen * 0.55;
		const M = 6;                            // spanwise stations
		const verts = [], norms = [], uvs = [], idx = [];

		const st = [];
		for (let j = 0; j <= M; j++) {
			const s = j / M;
			const z = side * s * W;
			const leadX = 0.12 * chordRoot - 0.34 * W * s;   // leading edge swept back
			const chord = chordRoot * (1.0 - 0.82 * s);      // taper to a pointed tip
			const trailX = leadX - chord;
			const y = 0.12 * W * Math.sin(s * Math.PI * 0.75); // gentle arch
			st.push({ leadX, trailX, y, z });
		}
		// double-sided membrane: front faces up, back faces down
		for (let j = 0; j < M; j++) {
			const A = st[j], B = st[j + 1];
			pushQuad(verts, norms, uvs, idx,
				[A.leadX, A.y, A.z], [A.trailX, A.y, A.z],
				[B.trailX, B.y, B.z], [B.leadX, B.y, B.z]);
		}

		const wing = new SceneObject();
		wing.mat.color = o.wingColor.slice();
		wing.mat.roughness = o.roughness;
		wing.mat.metallic = 0;
		wing.castShadow = false;
		wing.receiveShadow = false;
		wing.addMesh(makeMesh(verts, norms, uvs, idx));
		return wing;
	}

	update() {
		const now = (typeof performance !== "undefined" ? performance.now() : Date.now());
		let dt = this._last ? (now - this._last) / 1000 : 0.016;
		this._last = now;
		if (dt > 0.05) dt = 0.05;
		this._clock += dt;

		const g = this.glide, t = this._clock;
		const fx = g.followTarget && g.followTarget.location ? g.followTarget.location.x : 0;
		const fz = g.followTarget && g.followTarget.location ? g.followTarget.location.z : 0;

		const a = g.phase + g.dir * t * g.speed;
		const ca = Math.cos(a), sa = Math.sin(a);
		const bob = g.bob * Math.sin(t * g.bobFreq * Math.PI * 2);

		this.location.set(fx + g.center[0] + g.radius * ca, g.center[1] + bob, fz + g.center[2] + g.radius * sa);

		// yaw to face the tangent of the circle (forward is +X)
		const vx = g.dir * -sa, vz = g.dir * ca;
		const yaw = Math.atan2(vx, vz) * 180 / Math.PI;
		this.angle.set(0, yaw, 0);

		// flap: symmetric wing-beat about the body's forward axis
		const flap = this.options.flapAmp * Math.sin(t * this.options.flapFreq * Math.PI * 2 + this.options.flapPhase);
		this.wingPosZ.angle.x = -flap;   // +Z wing up when flap > 0
		this.wingNegZ.angle.x = flap;    // -Z wing up when flap > 0
	}
}

// --- mesh helpers ---------------------------------------------------------

// A double-sided quad (p0,p1,p2,p3 wound one way). Front gets an up-ish normal,
// back the opposite, with duplicated verts so each side lights correctly.
function pushQuad(verts, norms, uvs, idx, p0, p1, p2, p3) {
	const n = faceNormal(p0, p1, p2);
	const front = verts.length / 3;
	for (const p of [p0, p1, p2, p3]) { verts.push(p[0], p[1], p[2]); norms.push(n[0], n[1], n[2]); uvs.push(0, 0); }
	idx.push(front, front + 1, front + 2, front, front + 2, front + 3);
	const back = verts.length / 3;
	for (const p of [p0, p1, p2, p3]) { verts.push(p[0], p[1], p[2]); norms.push(-n[0], -n[1], -n[2]); uvs.push(0, 0); }
	idx.push(back, back + 2, back + 1, back, back + 3, back + 2);
}

function faceNormal(a, b, c) {
	const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
	const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
	const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
	const l = Math.hypot(nx, ny, nz) || 1;
	return [nx / l, ny / l, nz / l];
}

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

// Flip winding + normals if the tube came out inside-out (see Dolphin).
function orientOutward(verts, norms, idx, ringAxis, M, N) {
	let dotSum = 0;
	for (let i = 0; i <= N; i++) {
		const ax = ringAxis[i];
		for (let j = 0; j < M; j++) {
			const k = (i * M + j) * 3;
			const rx = verts[k] - ax[0], ry = verts[k + 1] - ax[1], rz = verts[k + 2] - ax[2];
			const rl = Math.hypot(rx, ry, rz) || 1;
			dotSum += (norms[k] * rx + norms[k + 1] * ry + norms[k + 2] * rz) / rl;
		}
	}
	if (dotSum < 0) {
		for (let i = 0; i < idx.length; i += 3) { const t = idx[i + 1]; idx[i + 1] = idx[i + 2]; idx[i + 2] = t; }
		for (let i = 0; i < norms.length; i++) norms[i] = -norms[i];
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
