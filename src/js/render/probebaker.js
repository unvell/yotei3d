
import { Vec3, Matrix4 } from "@jingwood/graphics-math";
import { FrameBuffer } from "../webgl/buffers";

// Per-face camera basis, matching IBLBaker's GL cubemap convention
// (face order +X, -X, +Y, -Y, +Z, -Z). For a 90° FOV camera at the probe
// looking along `forward` with `up`, screen NDC (s, t) maps to the world
// direction `forward + s*right + t*up`, so the same basis is reused to assign
// a direction to each read-back texel during SH projection.
const FACE_BASIS = [
	{ forward: [ 1,  0,  0], right: [ 0,  0, -1], up: [ 0, -1,  0] }, // +X
	{ forward: [-1,  0,  0], right: [ 0,  0,  1], up: [ 0, -1,  0] }, // -X
	{ forward: [ 0,  1,  0], right: [ 1,  0,  0], up: [ 0,  0,  1] }, // +Y
	{ forward: [ 0, -1,  0], right: [ 1,  0,  0], up: [ 0,  0, -1] }, // -Y
	{ forward: [ 0,  0,  1], right: [ 1,  0,  0], up: [ 0, -1,  0] }, // +Z
	{ forward: [ 0,  0, -1], right: [-1,  0,  0], up: [ 0, -1,  0] }, // -Z
];

// SH band-0/band-1 normalization constants (real spherical harmonics).
const SH_Y0 = 0.282095;
const SH_Y1 = 0.488603;

// Cosine-lobe convolution coefficients (irradiance), per SH band.
const SH_A0 = Math.PI;
const SH_A1 = (2.0 * Math.PI) / 3.0;

// Bakes a light-probe volume by capturing the lit scene into a small cubemap at
// each probe and projecting it to an SH L1 (4-coefficient) irradiance basis.
// The result is a spatially-varying indirect-diffuse field the standard shader
// samples by trilinearly blending nearby probes — i.e. an irradiance volume.
export class ProbeBaker {
	constructor(renderer) {
		this.renderer = renderer;
		this.faceSize = 16;        // per-face capture resolution
		this.faceBuffer = null;
	}

	// volume = { min:[x,y,z], max:[x,y,z], dims:[nx,ny,nz] }
	// returns { min, max, dims, count, cell:[cx,cy,cz],
	//           positions:Float32Array(count*3),
	//           coeffs:Float32Array(count*4*3) }  // 4 SH L1 coeffs (RGB) / probe
	bake(scene, volume) {
		const { min, max, dims } = volume;
		const [nx, ny, nz] = dims;
		const count = nx * ny * nz;

		const positions = new Float32Array(count * 3);
		const coeffs = new Float32Array(count * 4 * 3);
		const pixels = new Uint8Array(this.faceSize * this.faceSize * 4);

		const cell = [
			nx > 1 ? (max[0] - min[0]) / (nx - 1) : Math.max(max[0] - min[0], 1e-3),
			ny > 1 ? (max[1] - min[1]) / (ny - 1) : Math.max(max[1] - min[1], 1e-3),
			nz > 1 ? (max[2] - min[2]) / (nz - 1) : Math.max(max[2] - min[2], 1e-3),
		];

		if (!this.faceBuffer) {
			this.faceBuffer = new FrameBuffer(this.renderer, this.faceSize, this.faceSize);
		}

		const renderer = this.renderer;
		renderer._probeBaking = true;
		renderer.useShader("standard");

		let p = 0;
		for (let zi = 0; zi < nz; zi++) {
			for (let yi = 0; yi < ny; yi++) {
				for (let xi = 0; xi < nx; xi++) {
					const P = new Vec3(
						gridCoord(min[0], max[0], xi, nx),
						gridCoord(min[1], max[1], yi, ny),
						gridCoord(min[2], max[2], zi, nz),
					);
					positions[p * 3] = P.x;
					positions[p * 3 + 1] = P.y;
					positions[p * 3 + 2] = P.z;

					this.bakeProbe(scene, P, pixels, coeffs, p * 4 * 3);
					p++;
				}
			}
		}

		renderer.disuseCurrentShader();
		renderer._probeBaking = false;

		return { min, max, dims, count, cell, positions, coeffs };
	}

	bakeProbe(scene, P, pixels, outCoeffs, outOffset) {
		const gl = this.renderer.gl;
		const size = this.faceSize;

		// SH L1 accumulators: 4 coefficients, each RGB.
		const sh = [[0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0]];
		let weightSum = 0;

		for (let f = 0; f < 6; f++) {
			const basis = FACE_BASIS[f];
			this.setFaceMatrices(P, basis);

			this.faceBuffer.use();
			this.renderer.drawSceneFrame(scene);
			gl.readPixels(0, 0, size, size, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
			this.faceBuffer.disuse();

			const F = basis.forward, R = basis.right, U = basis.up;

			for (let r = 0; r < size; r++) {
				const t = ((r + 0.5) / size) * 2 - 1;
				for (let c = 0; c < size; c++) {
					const s = ((c + 0.5) / size) * 2 - 1;

					let dx = F[0] + s * R[0] + t * U[0];
					let dy = F[1] + s * R[1] + t * U[1];
					let dz = F[2] + s * R[2] + t * U[2];
					const inv = 1 / Math.sqrt(dx * dx + dy * dy + dz * dz);
					dx *= inv; dy *= inv; dz *= inv;

					// approximate texel solid angle on the cube face
					const w = Math.pow(1 + s * s + t * t, -1.5);
					weightSum += w;

					const idx = (r * size + c) * 4;
					// faceBuffer stores ~linear radiance (gamma is applied only at
					// the final screen pass), so no sRGB decode is needed here.
					const cr = pixels[idx] / 255;
					const cg = pixels[idx + 1] / 255;
					const cb = pixels[idx + 2] / 255;

					const b0 = SH_Y0;
					const b1 = SH_Y1 * dy;  // Y(1,-1)
					const b2 = SH_Y1 * dz;  // Y(1, 0)
					const b3 = SH_Y1 * dx;  // Y(1, 1)
					const bb = [b0, b1, b2, b3];

					for (let k = 0; k < 4; k++) {
						sh[k][0] += cr * bb[k] * w;
						sh[k][1] += cg * bb[k] * w;
						sh[k][2] += cb * bb[k] * w;
					}
				}
			}
		}

		// Normalize the discrete integral to the full sphere (4π), apply the
		// cosine-lobe convolution per band, and fold in 1/π so the result is a
		// Lambertian irradiance term that the shader multiplies by albedo.
		const norm = (4 * Math.PI) / weightSum;
		const invPi = 1 / Math.PI;
		const A = [SH_A0, SH_A1, SH_A1, SH_A1];

		for (let k = 0; k < 4; k++) {
			const a = A[k] * norm * invPi;
			outCoeffs[outOffset + k * 3] = sh[k][0] * a;
			outCoeffs[outOffset + k * 3 + 1] = sh[k][1] * a;
			outCoeffs[outOffset + k * 3 + 2] = sh[k][2] * a;
		}
	}

	// Build the renderer's project-view matrix for a 90° FOV camera at the probe
	// facing the given cube face. Matches the engine's row-vector convention:
	// projectionViewMatrix = view * projection (applied as p_row * M).
	setFaceMatrices(P, basis) {
		const renderer = this.renderer;

		const F = new Vec3(basis.forward[0], basis.forward[1], basis.forward[2]);
		const U = new Vec3(basis.up[0], basis.up[1], basis.up[2]);

		const view = new Matrix4().lookAt(P, Vec3.add(P, F), U);
		// lookAt leaves the translation row zeroed; set it to -axis·P.
		const xaxis = new Vec3(view.a1, view.a2, view.a3);
		const yaxis = new Vec3(view.b1, view.b2, view.b3);
		const zaxis = new Vec3(view.c1, view.c2, view.c3);
		view.a4 = -Vec3.dot(xaxis, P);
		view.b4 = -Vec3.dot(yaxis, P);
		view.c4 = -Vec3.dot(zaxis, P);
		view.d4 = 1;

		// Small near plane so walls close to the probe are still captured.
		const far = renderer.options.perspective.far;
		const proj = new Matrix4().perspective(90, 1, 0.05, far);

		const pv = view.mul(proj);
		renderer.projectionViewMatrix = pv;
		renderer.projectionViewMatrixArray = pv.toArray();
	}

	destroy() {
		if (this.faceBuffer) {
			this.faceBuffer.destroy();
			this.faceBuffer = null;
		}
	}
}

function gridCoord(a, b, i, n) {
	if (n <= 1) return (a + b) * 0.5;
	return a + (b - a) * (i / (n - 1));
}
