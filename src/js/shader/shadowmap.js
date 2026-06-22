
import { Vec3, Matrix4, BoundingBox3D } from "@/math";
import { Shader } from '../webgl/shader.js';
import { ParticleObject, ObjectTypes } from "../scene/object.js";

export class ShadowMapShader extends Shader {
	constructor(renderer, vertShaderSrc, fragShaderSrc) {
		super(renderer, vertShaderSrc, fragShaderSrc);

		this.vertexPositionAttribute = this.findAttribute('vertexPosition');
		this.projectionMatrixUniform = this.bindUniform("projectionMatrix", "mat4");
    
    // skin
    this.vertexJointAttribute = this.findAttribute("a_joint");
    this.vertexWeightAttribute = this.findAttribute("a_weight");
    this.jointMatrixUniforms = this.bindUniformArray("u_jointMat", "mat4", 100);

		this.lightMatrix = new Matrix4();
		this.projectionMatrix = new Matrix4();

		const aspectRate = this.renderer.aspectRate;
		const scale = renderer.options.shadowQuality.scale || 5;
		const viewDepth = renderer.options.shadowQuality.viewDepth || 5;
		this.projectionMatrix.ortho(-aspectRate * scale, aspectRate * scale,
      -scale, scale, -viewDepth, viewDepth);

		// Keep the constructor-time fixed frustum as a fallback for when auto-fit
		// is disabled or the scene has no boundable geometry yet.
		this._fallbackProjection = this.projectionMatrix.clone();
	}

	beginScene(scene) {
		const shadowQuality = this.renderer.options.shadowQuality || {};

		// Auto-fit the shadow frustum to the scene each frame (default on). This
		// makes a single shadow setup work for any scene size/placement without
		// per-example scale/viewDepth tuning: every visible surface maps into the
		// shadow map's [0,1] cube, so the depth comparison is always valid and the
		// 8-bit depth range stays tight (better precision, no false self-shadow).
		let fitted = false;
		if (shadowQuality.autoFit !== false) {
			fitted = this._fitToScene(scene);
		}

		if (!fitted) {
			// Legacy fixed frustum centred on the world origin.
			this.lightPosition = scene.sun.location;
			this.lightMatrix.lookAt(this.lightPosition, Vec3.zero, Vec3.add(this.lightPosition, Vec3.forward));
			this.projectionMatrix.copyFrom(this._fallbackProjection);
		}

		this.lightProjectionMatrix = this.lightMatrix.mul(this.projectionMatrix);
	}

	// World-space AABB of everything the shadow map should cover: visible solid
	// geometry (both casters and receivers). Lights, cameras and particle volumes
	// (snow/rain/clouds) are excluded — their bounds would needlessly blow up the
	// frustum and waste the limited 8-bit depth range.
	_computeShadowBounds(scene) {
		let bbox = null;

		for (const obj of scene.objects) {
			if (!obj.visible) continue;
			if (obj instanceof ParticleObject) continue;
			if (obj.type === ObjectTypes.PointLight
				|| obj.type === ObjectTypes.SpotLight
				|| obj.type === ObjectTypes.Camera) continue;

			const objBBox = obj.getBounds();
			if (objBBox) {
				bbox = BoundingBox3D.findBoundingBoxOfBoundingBoxes(bbox, objBBox);
			}
		}

		return bbox;
	}

	// Fit lightMatrix (view) + projectionMatrix (ortho) to the scene bounds.
	// Returns false (caller falls back) when there is nothing to fit.
	//
	// Uses the scene's bounding *sphere* rather than a tight box fit: the sphere
	// is rotation-invariant, so the frustum size stays constant as the sun moves
	// and the shadow texels don't shimmer. The eye is pulled back along the sun
	// direction far enough to see the whole sphere, and near/far are clamped tight
	// to it to preserve depth precision.
	_fitToScene(scene) {
		const bbox = this._computeShadowBounds(scene);
		if (!bbox) return false;

		const min = bbox.min, max = bbox.max;
		if (!isFinite(min.x) || !isFinite(min.y) || !isFinite(min.z)
			|| !isFinite(max.x) || !isFinite(max.y) || !isFinite(max.z)) {
			return false;
		}

		const center = new Vec3((min.x + max.x) * 0.5, (min.y + max.y) * 0.5, (min.z + max.z) * 0.5);
		const dx = max.x - min.x, dy = max.y - min.y, dz = max.z - min.z;
		let radius = 0.5 * Math.sqrt(dx * dx + dy * dy + dz * dz);
		if (!(radius > 0)) return false;   // degenerate / empty scene
		radius *= 1.02;                     // small margin so boundary geometry isn't clipped

		// Direction toward the sun (sun.location is a direction for the directional light).
		let dir = Vec3.normalize(scene.sun.location);
		if (!isFinite(dir.x) || (dir.x === 0 && dir.y === 0 && dir.z === 0)) {
			dir = new Vec3(0, 1, 0);
		}

		// Avoid a degenerate look-at when the sun is straight overhead.
		const up = Math.abs(dir.y) > 0.99 ? new Vec3(0, 0, 1) : new Vec3(0, 1, 0);

		const dist = radius * 2;
		const eye = Vec3.add(center, Vec3.mul(dir, dist));

		// View matrix (world → light space) WITH translation.
		this.lightMatrix.lookAt(eye, center, up).translate(-eye.x, -eye.y, -eye.z);

		// Square ortho tightly bracketing the sphere; near/far measured from the eye.
		const near = dist - radius;   // = radius
		const far = dist + radius;    // = 3 * radius
		this.projectionMatrix.ortho(-radius, radius, -radius, radius, near, far);

		this.lightPosition = eye;
		return true;
	}

	beginObject(obj) {
		super.beginObject(obj);
  
		const m = obj._transform.mul(this.lightProjectionMatrix);
    this.projectionMatrixUniform.set(m);
    
    this.maxJointCount = 2;
    
    // skin
    if (obj.skin) {
      if (this.maxJointCount < obj.skin.joints.length) {
        this.maxJointCount = obj.skin.joints.length;
      }

      if (obj.skin.inverseMatrices.length > 0) {
        for (let i = 0; i < obj.skin.joints.length; i++) {
          this.jointMatrixUniforms[i].set(obj.skin.inverseMatrices[i].mul(obj.skin.joints[i].jointMatrix));
        }
      } else {
        for (let i = 0; i < obj.skin.joints.length; i++) {
          this.jointMatrixUniforms[i].set(obj.skin.joints[i].jointMatrix);
        }
      }
    } else {
      for (let i = 0; i < this.maxJointCount; i++) {
        this.jointMatrixUniforms[i].set(Matrix4.IdentityArray);
      }
    }
  }

  beginMesh(mesh) {
    super.beginMesh(mesh);

    const gl = this.gl;
    
    // skin
    if (this.vertexJointAttribute >= 0) {
      if (mesh.jointBuffer) {
        gl.bindBuffer(gl.ARRAY_BUFFER, mesh.meta.skinJointBufferId);
        gl.vertexAttribPointer(this.vertexJointAttribute, 4, gl.UNSIGNED_SHORT, false, mesh.meta.jointStride, 0);
        gl.enableVertexAttribArray(this.vertexJointAttribute);
      } else {
        gl.disableVertexAttribArray(this.vertexJointAttribute);
      }
    }
    if (this.vertexWeightAttribute >= 0) {
      if (mesh.jointWeightsBuffer) {
        gl.bindBuffer(gl.ARRAY_BUFFER, mesh.meta.skinJointWeightsBufferId);
        gl.vertexAttribPointer(this.vertexWeightAttribute, 4, gl.FLOAT, false, 0, 0);
        gl.enableVertexAttribArray(this.vertexWeightAttribute);
      } else {
        gl.disableVertexAttribArray(this.vertexWeightAttribute);
      }
    }
  }
  
  endObject(obj) {
    super.endObject(obj);

    // skin
    if (obj.skin) {
      for (let i = 0; i < this.maxJointCount; i++) {
        this.jointMatrixUniforms[i].set(Matrix4.IdentityArray);
      }
    }
  }
}
