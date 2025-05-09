
import { Vec3, Vec4, Color3, Matrix4, MathFunctions } from "@jingwood/graphics-math";
import { MathFunctions as _mf, MathFunctions as _mf3 } from "@jingwood/graphics-math";
import { BoundingBox3D  } from "@jingwood/graphics-math";
import { EventDispatcher } from '../utility/event';
import { arrayRemove } from '../utility/utility';
import { Material } from '@'

export const CollisionModes = {
	None: 0,
	BoundingBox: 1,
	Sphere: 2,
	Cylinder: 3,
	Mesh: 5,
	NavMesh: 6,
	Compound: 8,
	Custom: 9,
};

export class SceneObject {
	constructor() {
		this._parent = undefined;
		this._scene = undefined;
		this._transform = new Matrix4().loadIdentity();
		this._normalTransform = new Matrix4().loadIdentity();

		this._suspendTransformUpdate = true;
		this._location = new ObjectVectorProperty(this, "onmove");
		this._angle = new ObjectVectorProperty(this, "onrotate");
		this._scale = new ObjectVectorProperty(this, "onscale", Vec3.One);
    this._worldLocation = Vec3.zero;
    this._quaternion = null;
    this.rotationType = 'e';
		this._suspendTransformUpdate = false;

		this.meshes = [];
		this.objects = [];

    this.castShadow = true;
    this.receiveShadow = true;
		this.receiveLight = true;
		this.visible = true;
    this.hitable = true;
    this._opacity = 1;

		this.collisionMode = CollisionModes.BoundingBox;
		this.collisionTarget = null;
		this.radiyBody = null;

		this.isSelected = false;
    this.mat = new Material();
	}

	_changePrototype(newproto) {
		this._location.obj = newproto;
		this._angle.obj = newproto;
		this._scale.obj = newproto;
	}

	get scene() {
		return this._scene;
	}

	set scene(val) {
		if (this._scene != val) {
			if (this._scene) {
				this._scene.onobjectRemove(this);
			}

			this._scene = val;
			this._scene.whenObjectAdd(this);
			this.onsceneChange(this._scene);
		}

		for (const child of this.objects) {
			child.scene = this._scene;
  	}
	}

	get location() { return this._location; }
	set location(_) { this._location.set(...arguments); }

	get angle() { return this._angle; }
	set angle(_) { this._angle.set(...arguments); }
	
	get scale() { return this._scale; }
	set scale(_) { this._scale.set(...arguments); }

	get parent() { return this._parent; }
	set parent(value) {
		if (this._parent != value) {
			this._parent = value;
			this.onparentChange();
		}
  }
  
  get opacity() {
    return this._opacity;
  }

  set opacity(v) {
    if (this._opacity !== v) {
      this._opacity = v;

      for (const child of this.objects) {
        if (child.opacity < this._opacity) child.opacity = this._opacity;
      }

      if (this._scene) {
        this._scene.requireUpdateFrame();
      }
    }
  }

	get polygonCount() {
		if (!Array.isArray(this.meshes)) return 0;
			
		let polygonCount = 0;
		for (let i = 0; i < this.meshes.length; i++) {
			polygonCount += this.meshes[i].polygonCount;
		}

		return polygonCount;
  }
  
  get transform() {
    return this._transform;
  }

	updateTransform() {
		if (this._suspendTransformUpdate) return;

		let t = this._transform;

		if (this._parent) {
			t.copyFrom(this._parent._transform);
		} else {
			t.loadIdentity();
		}

		this._worldLocation = (new Vec4(this._location, 1.0).mulMat(t)).xyz;

		if (!this._location.equals(0, 0, 0)
			|| !this._angle.equals(0, 0, 0)
			|| !this._scale.equals(1, 1, 1)) {

			// TODO: merge transform calc
			t.translate(this._location._x, this._location._y, this._location._z);
      
      // NOTE!! Experimental quaternion support 
      if (this._quaternion) {
        const tr = this._quaternion.toMatrix();
        t = t.mul(tr);
      } else {
        t.rotate(this._angle._x, this._angle._y, this._angle._z, this._angleOrder);
      }

			t.scale(this._scale._x, this._scale._y, this._scale._z);
		}

		this._normalTransform.copyFrom(t);
		this._normalTransform.inverse().transpose();

		for (const child of this.objects) {
			child.updateTransform();
		}
	}

	clone() {
		return SceneObject.clone(this);
	}

	static clone(obj) {
		let newObj = new SceneObject();
		
		newObj._suspendTransformUpdate = true;

    newObj._parent = obj._parent;
    newObj._scene = obj._scene;

		newObj.location = obj.location;
		newObj.angle = obj.angle;
		newObj.scale = obj.scale;

		newObj._transform = obj._transform.clone();
    newObj._normalTransform = obj._normalTransform.clone();
		newObj._worldLocation = obj._worldLocation.clone();

		newObj.castShadow = obj.castShadow;
		newObj.receiveShadow = obj.receiveShadow;
		newObj.receiveLight = obj.receiveLight;
		newObj.visible = obj.visible;
    newObj.hitable = obj.hitable;

		newObj.collisionMode = obj.collisionMode;
		newObj.collisionTarget = obj.collisionTarget;
		newObj.radiyBody = obj.radiyBody;
		newObj.isSelected = obj.isSelected;
		newObj.wireframe = obj.wireframe;

		newObj.mat = obj.mat;
		
		for (const mesh of obj.meshes) {
			newObj.addMesh(mesh);
		}

		for (const child of obj.objects) {
			newObj.add(child.clone());
		}

		newObj._suspendTransformUpdate = false;
		// newObj.updateTransform();

		return newObj;
	}

	move(x, y, z) {
		const movement = new Vec3(x, y, z);
		
		switch (this.collisionMode) {
			default:
				break;
	
			case CollisionModes.NavMesh:
				const navmesh = this.collisionTarget;
				if (navmesh && Array.isArray(navmesh.meshes) && navmesh.meshes.length > 0) {
					const mesh = navmesh.meshes[0];

					if (movement.x !== 0 || movement.y !== 0 || movement.z !== 0) {
						const worldLoc = this.worldLocation;
						const transform = navmesh.getTransformMatrix(true);

						const scene = this.scene;
						const rdebugger = (scene && scene.renderer && scene.renderer.options.debugMode) ? scene.renderer.debugger : undefined;
						
						if (rdebugger) {
							rdebugger.beforeNavmeshMovementCheck();
						}

						var result = mesh.validateMovementUsingVertexData(worldLoc, movement, this.collisionOption, transform);
						
						if (rdebugger) {
							rdebugger.afterNavmeshMovementCheck();
						}
						
						if (!result) return false;
					}
				}
				break;
		}
		
		if (movement.x !== 0 || movement.y !== 0 || movement.z !== 0) {
      this.location.offset(movement);
      
      if (this._cachedBbox) {
        this._cachedBbox.min.offset(movement);
        this._cachedBbox.max.offset(movement);
      }

			if (this.scene) this.scene.requireUpdateFrame();
			this.onmove();
		}

		return true;
	}

	moveOffset(x, y, z) {
		this.location.set(this.location.x + x, this.location.y + y, this.location.z + z);
		if (this.scene) {
			this.scene.requireUpdateFrame();
		}
	}

	add(obj) {
		if (obj.parent) {
			obj.parent.remove(obj);
		}

		this.objects.push(obj);
		obj.parent = this;
		obj.updateTransform();

		const scene = this.scene;
	
		if (scene && obj._scene != scene) {
			obj.scene = scene;
			scene.requireUpdateFrame();
		}
	}

	remove(child) {
		this.objects = this.objects.filter(obj => obj != child);
		child.parent = null;

		var scene = this.scene;
		if (scene) {
			scene.onobjectRemove(child);
		}
	}

	addMesh(mesh) {
		if (mesh) {
			this.meshes.push(mesh);
			this.onmeshAdd(mesh);
		}
	}

	removeMesh(mesh) {
    arrayRemove(this.meshes, mesh);
		this.onmeshRemove(mesh);
  }
  
	findObjectByName(name) {
		for (const obj of this.objects) {
			if (obj.name === name) return obj;
		}

		for (const obj of this.objects) {
			const child = obj.findObjectByName(name);
			if (child) return child;
		}

		return null;
	}

	findObjectsByType(type, options) {
		type = (type || ObjectTypes.GenericObject);
		options = options || {};
		
		var arr = [], i, obj;

		for (const obj of this.objects) {
			if (obj.type == type) {
				if (typeof options.filter === "undefined" || options.filter(obj)) {
					arr.push(obj);
				}
			}
		}

		for (const obj of this.objects) {
			arr = arr.concat(obj.findObjectsByType(type, options));
		}

		return arr;
	}

	/*
	 * itearte over all children of this object,
	 * pass the object to specified iterator function.
	 */
	eachChild(iterator) {
		if (typeof iterator !== "function") return;
	
		for (const obj of this.objects) {
			iterator(obj);
		}

		for (const obj of this.objects) {
			obj.eachChild(iterator);
		}
	}

	draw(renderer) {
		this.ondraw(renderer);
	}

  moveTo(loc, options = {}, onfinish) {
		if (typeof loc !== "object") return;

		let startLocation = options.startLocation || this.worldLocation,
			startDirection, startUplook,
			endLocation = loc,
			endDirection, endUplook;

		let rotationMatrix;

		if (options.lookdir) {
			endDirection = options.lookdir || (options.lookObject ? options.lookObject.worldLocation : Vec3.forward);
		}

		if (options.lookup) {
			endUplook = options.up || options.lookup || Vec3.up;
		} else if (options.lookdir) {
			endUplook = Vec3.up;
		}

		if (options.startLookdir && endDirection) {
			startDirection = options.startLookdir;
		} else {
			if (rotationMatrix === undefined) rotationMatrix = this.getRotationMatrix(true);
			startDirection = new Vec3(rotationMatrix.c1, rotationMatrix.c2, -rotationMatrix.c3).normalize();
		}

		if (startDirection && endDirection && options.startLookup && endUplook) {
			startUplook = options.startLookup;
		} else {
			if (rotationMatrix === undefined) rotationMatrix = this.getRotationMatrix(true);
			startUplook = new Vec3(rotationMatrix.b1, rotationMatrix.b2, -rotationMatrix.b3).normalize();
		}
		
		if (typeof options.animation !== "boolean" || options.animation === true) {
			this.scene.animate(options, t => {

				const newLocation = Vec3.lerp(startLocation, endLocation, t);
				const diff = Vec3.sub(newLocation, this.location);
				this.move(diff.x, diff.y, diff.z);

				if (startDirection && endDirection) {
					this.lookAt(
						Vec3.add(this.location, Vec3.lerp(startDirection, endDirection, t)),
						Vec3.lerp(startUplook, endUplook, t));
				}

				if (typeof options.onframe === "function") {
					options.onframe.call(this, t);
				}

			}, function() {
				if (typeof onfinish === "function") {
					onfinish();
				}
			});
		} else {
			this.location = endLocation;
			this.lookAt(endDirection, endUplook);
		}
	}
	
	getLookAt() {
		return this.getRotationMatrix(true).extractLookAtVectors();
	}

	/**
	 * Check whether this object is child object of specified object.
	 */
	childOf(parent) {
		var obj = this;
		while (obj.parent) {
			if (obj.parent == parent) {
				return true;
			}
			obj = obj.parent;
		}
		return false;
	}

	getTransformMatrix(selfTransform) {

		if (selfTransform) {
			return this._transform;
		}
			
		return this._parent ? this._parent._transform : Matrix4.Identity;
	}

	getRotationMatrix(selfRotate) {
		var plist = [];
		var parent = this.parent;

		while (parent) {
			plist.push(parent);
			parent = parent.parent;
		}

		var m = new Matrix4().loadIdentity();

		for (var i = plist.length - 1; i >= 0; i--) {
			var obj = plist[i];

			m.rotate(obj.angle.x, obj.angle.y, obj.angle.z);
		}

		if (selfRotate === true) {
			m.rotate(this.angle.x, this.angle.y, this.angle.z);
		}

		return m;
	}

	get worldLocation() {
		return this._worldLocation;
	}

	getWorldRotation() {
		var m = this.getRotationMatrix(true);
		return _mf3.getEulerAnglesFromMatrix(m);
	}

	setWorldLocation(loc) {
		var m = this.getTransformMatrix().inverse();
		this.location = (new Vec4(loc, 1.0).mulMat(m)).xyz;
	}

	setWorldRotation(rot) {
		var m = this.getRotationMatrix().inverse();
		m.rotateZ(-rot.z);
		m.rotateY(-rot.y);
		m.rotateX(-rot.x);
		this.angle = m.inverse().extractEulerAngles();
	}

	/*
	 * Perform hit test from specified ray.
	 */
	hitTestByRay(ray, out) {
		if (typeof this.radiyBody === "object" && this.radiyBody !== null) {
			var type = "cube";

			if (typeof this.radiyBody.type !== "undefined") {
				type = this.radiyBody.type;
			}

			switch (type) {
				default:
				case "box":
					break;

				case "plane":
					var triangle = this.radiyBody.vertices;
					if (triangle) {
						if (Array.isArray(triangle)) {
							triangle = { v1: triangle[0], v2: triangle[1], v3: triangle[2] };
						}
					
						var planeVectors = {
							v1: new Vec4(triangle.v1, 1.0).mulMat(this._transform).xyz,
							v2: new Vec4(triangle.v2, 1.0).mulMat(this._transform).xyz,
							v3: new Vec4(triangle.v3, 1.0).mulMat(this._transform).xyz,
						};
						
						var hit = _mf3.rayIntersectsPlane(ray, planeVectors, 99999);

						if (hit) {
							out.t = hit.t;

							var f1 = planeVectors.v1.sub(hit.hit);
							var f2 = planeVectors.v2.sub(hit.hit);
							var f3 = planeVectors.v3.sub(hit.hit);

							var a = ((planeVectors.v1.sub(planeVectors.v2)).cross(planeVectors.v1.sub(planeVectors.v3))).length();
							var a1 = f2.cross(f3).length() / a;
							var a2 = f3.cross(f1).length() / a;
							var a3 = f1.cross(f2).length() / a;
					
							out.localPosition = (triangle.v1.mul(a1)).add(triangle.v2.mul(a2)).add(triangle.v3.mul(a3));
							
							return true;
						}
						
						return false;
					}
					break;

				case "sphere":
					{
						let radius = 0.1;

						if (typeof this.radiyBody.radius !== "undefined") {
							radius = this.radiyBody.radius;
						}

						const loc = new Vec4(0, 0, 0, 1).mulMat(this._transform).xyz;

						const inSphere = _mf3.rayIntersectsSphere(ray, { origin: loc, radius: radius }, out);
						if (inSphere) out.t = 0;

						return inSphere;
					}
					break;
			}
		}
	}

	getBounds(options) {

		if (this._cachedBbox) return this._cachedBbox;

		let bbox;

		if (Array.isArray(this.meshes)) {
			for (let i = 0; i < this.meshes.length; i++) {
				bbox = BoundingBox3D.findBoundingBoxOfBoundingBoxes(bbox, this.meshes[i].boundingBox);
			}
		}
	
		if (bbox) {
			bbox = BoundingBox3D.transformBoundingBox(bbox, this._transform);
		}

    for (const child of this.objects) {
      if (child.visible) {
        const childBBox = child.getBounds();
					
        if (!options || !options.filter || options.filter(object)) {
          if (!bbox) {
            bbox = new BoundingBox3D(childBBox);
          } else {
            bbox = BoundingBox3D.findBoundingBoxOfBoundingBoxes(bbox, childBBox);
          }
        }
      }
    }
		
		this._cachedBbox = bbox;

		return bbox;
	}

	setCustomProperties(value) {
		this._customProperties = value;
	}

	getCustomProperties() {
		return this._customProperties;
	}

	onmove() {
	}

	onrotate() {
	}

	onscale() {
  }
  
  destroy() {

    for (const child of this.objects) {
      child.destroy();
    }

    this.objects = new Set();

    for (const mesh of this.meshes) {
      mesh.destroy();
    }
   
    this.meshes = [];
  }
};

new EventDispatcher(SceneObject).registerEvents(
	"mousedown", "mouseup", "mouseenter", "mouseout", 
	"begindrag", "drag", "enddrag",
	"move", "rotate", "scale",
	"draw", 
	"add", "sceneChange", "parentChange",
	"meshAdd", "meshRemove");

export class ObjectVectorProperty extends Vec3 {
  constructor(obj, eventName, defValue) {
    super();

    this.obj = obj;

    if (defValue) {
      super.set(defValue);
    } else {
      this._x = 0; this._y = 0; this._z = 0;
    }
	
    if (eventName) {
      this.eventName = eventName;
      this.changeEvent = obj[eventName];
    }
  }
	
  get x() { return this._x; }
  set x(val) {
    if (this._x !== val) {
      this._x = val;
      this.notifyObj();
    }
  }
	
  get y() { return this._y; }
  set y(val) {
    if (this._y !== val) {
      this._y = val;
      this.notifyObj();
    }
  }
		
  get z() { return this._z; }
  set z(val) {
    if (this._z !== val) {
      this._z = val;
      this.notifyObj();
    }
  }
		
  set(arg0, arg1, arg2) {
    switch (arguments.length) {
      case 1:
        this.setVec3(arg0);
        break;
      
      case 3:
        this.setXYZ(arg0, arg1, arg2);
        break;
    }
  }

  setVec3(v) {
    if (Array.isArray(v)) {
      const [x, y, z] = v;
      this.setXYZ(x, y, z);
    } else if (typeof v === "object") {
      const { x, y, z } = v;
      this.setXYZ(x, y, z);
    }
  }

  setXYZ(x, y, z) {
    if (this._x !== x || this._y !== y || this._z !== z) {
      this._x = x;
      this._y = y;
      this._z = z;
      this.notifyObj();
    }
  }

  notifyObj() {
    if (this.obj) {
      this.obj.updateTransform();
      if (this.changeEvent) this.changeEvent.call(this.obj);
    }
  }
	
};

Object.defineProperties(SceneObject.prototype, {

	// "angle": {
	// 	get: function() { return this._angle; },
	// 	set: function(value) { this._angle.setVec3(value); },
	// 	enumerable: false,
	// },
	// "location": {
	// 	get: function() {
	// 		return this._location;
	// 	},
	// 	set: function(value) {
	// 		// Vec3 object should be copied rather than set reference directly (treat as struct)
	// 		if (typeof value === "object" && typeof value.clone === "function") {
	// 			this._location = value.clone();
	// 		}
	// 		else {
	// 			this._location = value;
	// 		}
	// 	},
	// 	enumerable: false,
	// },

	// "angle": {
	// 	get: function() {
	// 		return this._angle;
	// 	},
	// 	set: function(value) {
	// 		// Vec3 object should be copied rather than set reference directly (treat as struct)
	// 		if (typeof value === "object" && typeof value.clone === "function") {
	// 			this._angle = value.clone();
	// 		}
	// 		else {
	// 			this._angle = value;
	// 		}
	// 	},
	// 	enumerable: false,
	// },

	// "scale": {
	// 	get: function() {
	// 		return this._scale;
	// 	},
	// 	set: function(value) {
	// 		// Vec3 object should be copied rather than set reference directly (treat as struct)
	// 		if (typeof value === "object" && typeof value.clone === "function") {
	// 			this._scale = value.clone();
	// 		}
	// 		else {
	// 			this._scale = value;
	// 		}
	// 	},
	// 	enumerable: false,
	// },

});

Object.assign(SceneObject.prototype, {

	forward: (function() {
		const defaultOptions = {
			animation: true,
			speed: 0.02,
		};

		return function(distance, options) {
			if (options && typeof options === "object") {
				Object.setPrototypeOf(options, defaultOptions);
			} else {
				options = defaultOptions;
			}
		
			const obj = this;
			let dir = obj.getLookAt().dir;

			if (typeof options.ignoreUpwardDirection === "undefined" || options.ignoreUpwardDirection === true) {
				dir.y = 0;
				dir = dir.normalize();
			}

			if (options.animation === false) {
				obj.move(dir.x * distance, 0, dir.z * distance);
			} else {
				var steps = Math.abs(distance / options.speed);
				var stepsInv = 1 / steps;
				var i = 0;

				function updateFrame() {
					if (i++ < steps) {
						var s = Math.sin(i * stepsInv * Math.PI);
						s = s * s * distance * options.speed * 2;
						obj.move(dir.x * s, 0, dir.z * s);
						requestAnimationFrame(updateFrame);
					}
				}
				requestAnimationFrame(updateFrame);
			}
		};
	})(),	

	backward: function(distance, options) {
		return this.forward(-distance, options);
	},

	lookAt: (function() {
		let m;

		return function lookAt(target, up) {
			if (target instanceof SceneObject) {
				target = target.worldLocation;
			}

			if (typeof target !== "object") {
				return;
			}

			if (up === undefined) up = Vec3.up;
			if (m === undefined) m = new Matrix4();

			m.lookAt(this.worldLocation, target, up);
			this.angle = m.extractEulerAngles().neg();
		};
	})(),

	lookAtObject: function(obj, up) {
		return this.lookAt(obj.worldLocation, up);
	},

});

SceneObject.scanTransforms = function(parent, handler) {

	for (const obj of parent.objects) {
		handler(obj, obj._transform);

		if (obj.objects.length > 0) {
			this.scanTransforms(obj, handler);
		}
	}
};

///////////////////////// ObjectTypes /////////////////////////

export const ObjectTypes = {
	GenericObject: 0,
	Empty: 11,
	Range: 15,
	Wall: 201,
	Beam: 202,
	Door: 203,
	Window: 204,
	Floor: 205,
	Div: 701,
  Text2D: 702,
  Camera: 801,
  Joint: 820,
	PointLight: 901,
	SpotLight: 902,
	ReflectionSource: 950,
	Cursor: 999,
};

////////////////////////// Sun //////////////////////////

export class Sun extends SceneObject {
	constructor() {
		super();

		this.visible = false;
	}
}

//////////////////// ParticleObject ////////////////////

export class ParticleObject extends SceneObject {
	constructor() {
		super();
	}
}

////////////////////////// Light //////////////////////////

export class PointLight extends SceneObject {
	constructor() {
		super();

		this.mat = {
			emission: 1.0,
			color: new Color3(1.0, 0.95, 0.9),
		};

		this.type = ObjectTypes.PointLight;
	}
}

////////////////////////// Joint //////////////////////////

export class JointObject extends SceneObject {
  constructor() {
    super();

    this.type = ObjectTypes.Joint;
    this.jointMatrix = new Matrix4();
    this._jointWorldRotation = new Matrix4();
  }

  updateTransform() {
    
    if (this.jointMatrix) {
      this.updateJoint();
    }

    super.updateTransform();

  }

  updateJoint() {
    const t = this.jointMatrix;

    if (this._parent && this._parent.jointMatrix) {
      t.copyFrom(this._parent.jointMatrix);
    } else {
      t.loadIdentity();
    }

    // TODO: merge transform calc
    t.translate(this._location._x, this._location._y, this._location._z);
      
    // NOTE!! Experimental quaternion support 
    if (this.rotationType === 'q' && this._quaternion) {
      const tr = this._quaternion.toMatrix();
      t.copyFrom(tr.mul(t));
    } else {
      // FIXME: gltf from blender should use 'XZY' order to get correct result
      t.rotate(this._angle._x, this._angle._y, this._angle._z, 'XZY');
    }

    t.scale(this._scale._x, this._scale._y, this._scale._z);

    // ------------------------------------------------------------------------------

    const tr = this._jointWorldRotation;

    if (this._parent && this._parent._jointWorldRotation) {
      tr.copyFrom(this._parent._jointWorldRotation);
    } else {
      tr.loadIdentity();
    }

    // NOTE!! Experimental quaternion support 
    if (this.rotationType === 'q' && this._quaternion) {
      const tmat = this._quaternion.toMatrix();
      tr.copyFrom(tmat.mul(tr));
    } else {
      // FIXME: gltf from blender should use 'XZY' order to get correct result
      tr.rotate(this._angle._x, this._angle._y, this._angle._z, 'XZY');
    }
  }

  get jointWorldRotation() {
    return this._jointWorldRotation;
  }

  draw(g) {
    // const p = this.location.mulMat(this.skin.inverseMatrices[i].mul(this.jointMatrix));
    // g.drawPoint(this.worldLocation, 10, this.skin ? 'red' : 'silver');
  }
}
