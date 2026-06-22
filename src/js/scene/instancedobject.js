
import { Matrix4 } from "@/math";
import { SceneObject, ObjectTypes } from "./object";
import { VertexAttributes } from "../webgl/shader";

// Renders many copies of a single mesh in one hardware-instanced draw call
// (drawElementsInstanced / drawArraysInstanced). Each instance is placed by a
// 4x4 model matrix supplied through the per-instance `instanceMatrix` vertex
// attribute (locations 10..13), so 1000 scattered props cost one draw, not
// 1000. Rendered with the lean `instanced` shader (sun + ambient, optional
// texture, vertex colour, fog).
//
// Instance matrices are relative to the InstancedObject's own transform, so
// the whole field can be moved / rotated / scaled as one (and orbit controllers
// that spin the target object work on it). v1 does not participate in the
// shadow pass (it neither casts into nor samples the shadow map).
export class InstancedObject extends SceneObject {
	constructor(baseMesh, options = {}) {
		super();

		this.type = ObjectTypes.GenericObject;
		this.isInstanced = true;
		this.baseMesh = baseMesh;

		this.castShadow = false;
		this.receiveShadow = false;

		this.mat = {
			shaderName: "instanced",
			color: options.color,
			tex: options.tex,
			ambient: options.ambient,
			castShadow: false,
		};

		this._instanceMatrixData = undefined;  // Float32Array, 16 floats / instance
		this._instanceCount = 0;
		this._instanceBuffer = undefined;
		this._instanceVao = undefined;
		this._dataDirty = true;      // instance matrices need (re)upload
		this._instanceCapacity = 0;  // floats currently allocated in the GL buffer

		if (Array.isArray(options.instances)) {
			this.setInstances(options.instances);
		} else if (Array.isArray(options.transforms)) {
			this.setTransforms(options.transforms);
		}
	}

	// matrices: array of Matrix4 (absolute world transforms)
	setInstances(matrices) {
		const count = matrices.length;
		const data = new Float32Array(count * 16);
		for (let i = 0; i < count; i++) {
			data.set(matrices[i].toArray(), i * 16);
		}
		this._instanceMatrixData = data;
		this._instanceCount = count;
		this._dataDirty = true;
	}

	// transforms: array of { location?, angle?, scale? }
	// (location/angle are {x,y,z}; scale is a number or {x,y,z})
	setTransforms(transforms) {
		this.setInstances(transforms.map(InstancedObject.transformToMatrix));
	}

	// Build a model matrix with the same translate→rotate→scale order
	// SceneObject.updateTransform() uses, so instanced and regular objects
	// place geometry identically.
	static transformToMatrix(tr) {
		const m = new Matrix4().loadIdentity();
		const loc = tr.location, ang = tr.angle, scl = tr.scale;
		if (loc) m.translate(loc.x || 0, loc.y || 0, loc.z || 0);
		if (ang) m.rotate(ang.x || 0, ang.y || 0, ang.z || 0);
		if (scl !== undefined && scl !== null) {
			if (typeof scl === "number") m.scale(scl, scl, scl);
			else m.scale(scl.x ?? 1, scl.y ?? 1, scl.z ?? 1);
		}
		return m;
	}

	get instanceCount() {
		return this._instanceCount;
	}

	_setupInstanceAttribs(renderer) {
		const gl = renderer.gl;
		gl.bindBuffer(gl.ARRAY_BUFFER, this._instanceBuffer);

		// a mat4 attribute is four vec4 columns at consecutive locations, each
		// advancing once per instance (divisor 1). Stride = 64 bytes (16 floats).
		const base = VertexAttributes.instanceMatrix;
		for (let c = 0; c < 4; c++) {
			const loc = base + c;
			gl.vertexAttribPointer(loc, 4, gl.FLOAT, false, 64, c * 16);
			gl.enableVertexAttribArray(loc);
			renderer.glInstanced.divisor(loc, 1);
		}
	}

	_ensureBuffers(renderer) {
		if (!this.baseMesh) return false;
		if (!this._instanceMatrixData || this._instanceCount <= 0) return false;

		const gl = renderer.gl;

		// upload base geometry on first use
		if (!this.baseMesh.meta || !this.baseMesh.meta.vertexBufferId) {
			if (!this.baseMesh.bind(renderer)) return false;
		}

		if (!this._instanceBuffer) this._instanceBuffer = gl.createBuffer();

		// (re)upload instance matrices when they change. Reallocate only when the
		// instance count grows; otherwise update in place.
		if (this._dataDirty) {
			gl.bindBuffer(gl.ARRAY_BUFFER, this._instanceBuffer);
			if (this._instanceMatrixData.length > this._instanceCapacity) {
				gl.bufferData(gl.ARRAY_BUFFER, this._instanceMatrixData, gl.DYNAMIC_DRAW);
				this._instanceCapacity = this._instanceMatrixData.length;
				// a fresh allocation invalidates pointers captured in the VAO
				if (this._instanceVao && renderer.glVAO) {
					renderer.glVAO.delete(this._instanceVao);
					this._instanceVao = undefined;
				}
			} else {
				gl.bufferSubData(gl.ARRAY_BUFFER, 0, this._instanceMatrixData);
			}
			this._dataDirty = false;
		}

		// Record geometry + instance attributes + element buffer into a VAO once,
		// so the draw is a single bind. The base mesh keeps its own (non-instanced)
		// VAO; this is a separate one that also wires the instance attributes.
		const vao = renderer.glVAO;
		if (vao && !this._instanceVao) {
			this._instanceVao = vao.create();
			vao.bind(this._instanceVao);
			this.baseMesh.setupVertexAttributes(gl);
			this._setupInstanceAttribs(renderer);
			vao.bind(null);
		}

		return true;
	}

	drawInstanced(renderer) {
		// Without instancing support, skip rather than draw N overlapping copies.
		if (!renderer.glInstanced) return;
		if (!this._ensureBuffers(renderer)) return;

		const gl = renderer.gl;
		const mesh = this.baseMesh;
		const meta = mesh.meta;
		const vao = renderer.glVAO;

		if (vao && this._instanceVao) {
			vao.bind(this._instanceVao);
		} else {
			mesh.setupVertexAttributes(gl);
			this._setupInstanceAttribs(renderer);
		}

		if (mesh.indexed) {
			const indexType = (mesh.indexBuffer instanceof Uint32Array)
				? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT;
			renderer.glInstanced.drawElements(gl.TRIANGLES, meta.indexCount, indexType, 0, this._instanceCount);
		} else {
			renderer.glInstanced.drawArrays(gl.TRIANGLES, 0, meta.vertexCount, this._instanceCount);
		}

		if (vao && this._instanceVao) {
			vao.bind(null);
		} else {
			// fallback path: reset divisors / disable so the instance attributes
			// don't leak into later non-instanced draws on the default VAO.
			const base = VertexAttributes.instanceMatrix;
			for (let c = 0; c < 4; c++) {
				renderer.glInstanced.divisor(base + c, 0);
				gl.disableVertexAttribArray(base + c);
			}
		}
	}

	destroy() {
		const gl = this._scene && this._scene.renderer && this._scene.renderer.gl;
		if (gl) {
			if (this._instanceVao && this._scene.renderer.glVAO) {
				this._scene.renderer.glVAO.delete(this._instanceVao);
			}
			if (this._instanceBuffer) gl.deleteBuffer(this._instanceBuffer);
		}
		this._instanceVao = undefined;
		this._instanceBuffer = undefined;
	}
}
