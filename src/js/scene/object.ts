
import { Vec3, Vec4, Color3, Matrix4 } from "@/math";
import { MathFunctions3 as _mf3 } from "@/math";
import { BoundingBox3D } from "@/math";
import { EventDispatcher } from '../utility/event';
import { arrayRemove } from '../utility/utility';
import { Material } from './material';

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
  _parent: any;
  _scene: any;
  _transform: Matrix4;
  _normalTransform: Matrix4;
  _suspendTransformUpdate: boolean;
  _transformDirty: boolean;
  _conformal: boolean;
  _location: ObjectVectorProperty;
  _angle: ObjectVectorProperty;
  _scale: ObjectVectorProperty;
  _worldLocation: Vec3;
  _quaternion: any;
  rotationType: string;
  _angleOrder?: string;

  meshes: any[];
  objects: any[];

  castShadow: boolean;
  receiveShadow: boolean;
  receiveLight: boolean;
  visible: boolean;
  hitable: boolean;
  _opacity: number;

  collisionMode: number;
  collisionTarget: any;
  collisionOption?: any;
  radiyBody: any;

  isSelected: boolean;
  mat: any;

  // optional, assigned by loaders / consumers
  name?: string;
  type?: number;
  wireframe?: boolean;
  skin?: any;
  _nodeId?: number;
  _cachedBbox?: any;
  _customProperties?: any;

  // --- members injected by the EventDispatcher mixin (see bottom of file) ---
  declare on: (event: string, listener: (...args: any[]) => any) => any;
  declare addEventListener: (event: string, listener: (...args: any[]) => any) => any;
  declare removeEventListener: (event: string, listener: (...args: any[]) => any) => void;
  declare onsceneChange: (...args: any[]) => any;
  declare onparentChange: (...args: any[]) => any;
  declare onmeshAdd: (...args: any[]) => any;
  declare onmeshRemove: (...args: any[]) => any;
  declare ondraw: (...args: any[]) => any;

  constructor() {
    this._parent = undefined;
    this._scene = undefined;
    this._transform = new Matrix4().loadIdentity();
    this._normalTransform = new Matrix4().loadIdentity();
    this._transformDirty = true;
    this._conformal = true;

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

  _changePrototype(newproto: any): void {
    this._location.obj = newproto;
    this._angle.obj = newproto;
    this._scale.obj = newproto;
  }

  get scene(): any {
    return this._scene;
  }

  set scene(val: any) {
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

  get location(): ObjectVectorProperty { return this._location; }
  set location(value: any) { this._location.set(value); }

  get angle(): ObjectVectorProperty { return this._angle; }
  set angle(value: any) { this._angle.set(value); }

  get scale(): ObjectVectorProperty { return this._scale; }
  set scale(value: any) { this._scale.set(value); }

  get parent(): any { return this._parent; }
  set parent(value: any) {
    if (this._parent != value) {
      this._parent = value;
      this.onparentChange();
    }
  }

  get opacity(): number {
    return this._opacity;
  }

  set opacity(v: number) {
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

  get polygonCount(): number {
    if (!Array.isArray(this.meshes)) return 0;

    let polygonCount = 0;
    for (let i = 0; i < this.meshes.length; i++) {
      polygonCount += this.meshes[i].polygonCount;
    }

    return polygonCount;
  }

  get transform(): Matrix4 {
    this._ensureTransform();
    return this._transform;
  }

  /*
   * Mark this object's world transform — and its whole subtree — as needing
   * recomputation. This is the cheap, eager half of the dirty-flag scheme: it
   * only flips flags and requests a redraw. The actual (costly) matrix
   * composition is deferred until the transform is next *read* (via the
   * `transform` / `worldLocation` getters or the per-frame resolve pass), so
   * editing several TRS components in one frame recomputes at most once instead
   * of once per setter.
   *
   * The early-out relies on the invariant that whenever a node is dirty its
   * descendants were already marked dirty in the same call, so re-walking the
   * subtree on an already-dirty node would be redundant.
   */
  invalidateTransform(): void {
    if (this._transformDirty) return;
    this._transformDirty = true;

    for (const child of this.objects) child.invalidateTransform();

    if (this._scene) this._scene.requireUpdateFrame();
  }

  /*
   * Lazily bring this node up to date, resolving the ancestor chain first so
   * the parent's world matrix is fresh before we compose against it. Walks
   * *up* only — children resolve themselves when they are read/drawn — so a
   * single read costs O(depth), not O(subtree).
   */
  _ensureTransform(): void {
    if (!this._transformDirty || this._suspendTransformUpdate) return;
    if (this._parent) this._parent._ensureTransform();
    this._composeTransform();
    this._transformDirty = false;
  }

  /*
   * Eagerly recompute this node and its entire subtree right now. Retained for
   * callers that need a whole branch fresh immediately (scene.add, model
   * loaders) rather than on next read.
   */
  updateTransform(): void {
    if (this._suspendTransformUpdate) return;

    if (this._parent) this._parent._ensureTransform();
    this._composeTransform();
    this._transformDirty = false;

    for (const child of this.objects) {
      child.updateTransform();
    }
  }

  /*
   * Compose this node's local→world matrix (and normal matrix + world
   * location) from its TRS and the parent's already-resolved world matrix.
   * Does NOT touch children — callers handle traversal.
   */
  _composeTransform(): void {
    const t = this._transform;

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
        // mul() returns a new matrix; write it back into _transform (which `t`
        // aliases) so the rotation/scale below land on the stored transform.
        t.copyFrom(t.mul(tr));
      } else {
        t.rotate(this._angle._x, this._angle._y, this._angle._z, this._angleOrder);
      }

      t.scale(this._scale._x, this._scale._y, this._scale._z);
    }

    // Normal matrix. The inverse-transpose only differs in *direction* from the
    // world matrix when the linear part is non-conformal — i.e. some
    // non-uniform scale exists on this node or an ancestor. The shader
    // re-normalizes, so for a conformal (translation + rotation + uniform
    // scale) chain the world matrix itself is a valid normal matrix and we can
    // skip the expensive inverse-transpose. Conformality propagates down the
    // hierarchy, so we AND with the parent's flag. Unit/uniform scale — the
    // overwhelmingly common case — takes the fast path.
    const sx = this._scale._x, sy = this._scale._y, sz = this._scale._z;
    this._conformal = (sx === sy && sy === sz)
      && (this._parent ? this._parent._conformal !== false : true);

    if (this._conformal) {
      this._normalTransform.copyFrom(t);
    } else {
      this._normalTransform.copyFrom(t).invertInPlace().transposeInPlace();
    }
  }

  clone(): SceneObject {
    return SceneObject.clone(this);
  }

  static clone(obj: any): SceneObject {
    const newObj: any = new SceneObject();

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

  move(x: number, y: number, z: number): boolean {
    const movement = new Vec3(x, y, z);

    switch (this.collisionMode) {
      default:
        break;

      case CollisionModes.NavMesh: {
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

            const result = mesh.validateMovementUsingVertexData(worldLoc, movement, this.collisionOption, transform);

            if (rdebugger) {
              rdebugger.afterNavmeshMovementCheck();
            }

            if (!result) return false;
          }
        }
        break;
      }
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

  moveOffset(x: number, y: number, z: number): void {
    this.location.set(this.location.x + x, this.location.y + y, this.location.z + z);
    if (this.scene) {
      this.scene.requireUpdateFrame();
    }
  }

  add(obj: any): void {
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

  remove(child: any): void {
    this.objects = this.objects.filter(obj => obj != child);
    child.parent = null;

    const scene = this.scene;
    if (scene) {
      scene.onobjectRemove(child);
    }
  }

  addMesh(mesh: any): void {
    if (mesh) {
      this.meshes.push(mesh);
      this.onmeshAdd(mesh);
    }
  }

  removeMesh(mesh: any): void {
    arrayRemove(this.meshes, mesh);
    this.onmeshRemove(mesh);
  }

  findObjectByName(name: string): any {
    for (const obj of this.objects) {
      if (obj.name === name) return obj;
    }

    for (const obj of this.objects) {
      const child = obj.findObjectByName(name);
      if (child) return child;
    }

    return null;
  }

  findObjectsByType(type: number, options?: any): any[] {
    type = (type || ObjectTypes.GenericObject);
    options = options || {};

    let arr: any[] = [];

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
  eachChild(iterator: (obj: any) => void): void {
    if (typeof iterator !== "function") return;

    for (const obj of this.objects) {
      iterator(obj);
    }

    for (const obj of this.objects) {
      obj.eachChild(iterator);
    }
  }

  draw(renderer: any): void {
    this.ondraw(renderer);
  }

  moveTo(loc: any, options: any = {}, onfinish?: () => void): void {
    if (typeof loc !== "object") return;

    const startLocation = options.startLocation || this.worldLocation,
      endLocation = loc;
    let startDirection: any, startUplook: any,
      endDirection: any, endUplook: any;

    let rotationMatrix: Matrix4 | undefined;

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
      this.scene.animate(options, (t: number) => {

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

      }, function () {
        if (typeof onfinish === "function") {
          onfinish();
        }
      });
    } else {
      this.location = endLocation;
      this.lookAt(endDirection, endUplook);
    }
  }

  getLookAt(): { dir: Vec3; up: Vec3 } {
    return this.getRotationMatrix(true).extractLookAtVectors();
  }

  /**
   * Check whether this object is child object of specified object.
   */
  childOf(parent: any): boolean {
    let obj: any = this;
    while (obj.parent) {
      if (obj.parent == parent) {
        return true;
      }
      obj = obj.parent;
    }
    return false;
  }

  getTransformMatrix(selfTransform?: boolean): Matrix4 {

    if (selfTransform) {
      this._ensureTransform();
      return this._transform;
    }

    if (this._parent) {
      this._parent._ensureTransform();
      return this._parent._transform;
    }

    return Matrix4.Identity;
  }

  getRotationMatrix(selfRotate?: boolean): Matrix4 {
    const plist: any[] = [];
    let parent = this.parent;

    while (parent) {
      plist.push(parent);
      parent = parent.parent;
    }

    const m = new Matrix4().loadIdentity();

    for (let i = plist.length - 1; i >= 0; i--) {
      const obj = plist[i];

      m.rotate(obj.angle.x, obj.angle.y, obj.angle.z);
    }

    if (selfRotate === true) {
      m.rotate(this.angle.x, this.angle.y, this.angle.z);
    }

    return m;
  }

  get worldLocation(): Vec3 {
    this._ensureTransform();
    return this._worldLocation;
  }

  getWorldRotation(): Vec3 {
    const m = this.getRotationMatrix(true);
    return _mf3.getEulerAnglesFromMatrix(m);
  }

  setWorldLocation(loc: any): void {
    const m = this.getTransformMatrix().inverse();
    this.location = (new Vec4(loc, 1.0).mulMat(m)).xyz;
  }

  setWorldRotation(rot: any): void {
    const m = this.getRotationMatrix().inverse();
    m.rotateZ(-rot.z);
    m.rotateY(-rot.y);
    m.rotateX(-rot.x);
    this.angle = m.inverse().extractEulerAngles();
  }

  /*
   * Perform hit test from specified ray.
   */
  hitTestByRay(ray: any, out: any): boolean | undefined {
    this._ensureTransform();
    if (typeof this.radiyBody === "object" && this.radiyBody !== null) {
      let type = "cube";

      if (typeof this.radiyBody.type !== "undefined") {
        type = this.radiyBody.type;
      }

      switch (type) {
        default:
        case "box":
          break;

        case "plane": {
          let triangle = this.radiyBody.vertices;
          if (triangle) {
            if (Array.isArray(triangle)) {
              triangle = { v1: triangle[0], v2: triangle[1], v3: triangle[2] };
            }

            const planeVectors = {
              v1: new Vec4(triangle.v1, 1.0).mulMat(this._transform).xyz,
              v2: new Vec4(triangle.v2, 1.0).mulMat(this._transform).xyz,
              v3: new Vec4(triangle.v3, 1.0).mulMat(this._transform).xyz,
            };

            const hit = _mf3.rayIntersectsPlane(ray, planeVectors, 99999);

            if (hit) {
              out.t = hit.t;

              const f1 = planeVectors.v1.sub(hit.hit);
              const f2 = planeVectors.v2.sub(hit.hit);
              const f3 = planeVectors.v3.sub(hit.hit);

              const a = ((planeVectors.v1.sub(planeVectors.v2)).cross(planeVectors.v1.sub(planeVectors.v3))).length();
              const a1 = f2.cross(f3).length() / a;
              const a2 = f3.cross(f1).length() / a;
              const a3 = f1.cross(f2).length() / a;

              out.localPosition = (triangle.v1.mul(a1)).add(triangle.v2.mul(a2)).add(triangle.v3.mul(a3));

              return true;
            }

            return false;
          }
          break;
        }

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
      }
    }
  }

  getBounds(options?: any): any {

    if (this._cachedBbox) return this._cachedBbox;

    this._ensureTransform();

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

        if (!options || !options.filter || options.filter(child)) {
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

  setCustomProperties(value: any): void {
    this._customProperties = value;
  }

  getCustomProperties(): any {
    return this._customProperties;
  }

  onmove(): void {
  }

  onrotate(): void {
  }

  onscale(): void {
  }

  forward(distance: number, options?: any): void {
    if (options && typeof options === "object") {
      Object.setPrototypeOf(options, SceneObject._forwardDefaultOptions);
    } else {
      options = SceneObject._forwardDefaultOptions;
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
      const steps = Math.abs(distance / options.speed);
      const stepsInv = 1 / steps;
      let i = 0;

      function updateFrame() {
        if (i++ < steps) {
          let s = Math.sin(i * stepsInv * Math.PI);
          s = s * s * distance * options.speed * 2;
          obj.move(dir.x * s, 0, dir.z * s);
          requestAnimationFrame(updateFrame);
        }
      }
      requestAnimationFrame(updateFrame);
    }
  }

  backward(distance: number, options?: any): void {
    return this.forward(-distance, options);
  }

  lookAt(target: any, up?: any): void {
    if (target instanceof SceneObject) {
      target = target.worldLocation;
    }

    if (typeof target !== "object") {
      return;
    }

    if (up === undefined) up = Vec3.up;
    if (SceneObject._lookAtMatrix === undefined) SceneObject._lookAtMatrix = new Matrix4();
    const m = SceneObject._lookAtMatrix;

    m.lookAt(this.worldLocation, target, up);
    this.angle = m.extractEulerAngles().neg();
  }

  lookAtObject(obj: any, up?: any): void {
    return this.lookAt(obj.worldLocation, up);
  }

  destroy(): void {

    for (const child of this.objects) {
      child.destroy();
    }

    this.objects = new Set() as any;

    for (const mesh of this.meshes) {
      mesh.destroy();
    }

    this.meshes = [];
  }

  static scanTransforms(parent: any, handler: (obj: any, transform: Matrix4) => void): void {
    for (const obj of parent.objects) {
      handler(obj, obj._transform);

      if (obj.objects.length > 0) {
        SceneObject.scanTransforms(obj, handler);
      }
    }
  }

  private static _forwardDefaultOptions = {
    animation: true,
    speed: 0.02,
  };

  private static _lookAtMatrix?: Matrix4;
}

new EventDispatcher(SceneObject).registerEvents(
  "mousedown", "mouseup", "mouseenter", "mouseout",
  "begindrag", "drag", "enddrag",
  "move", "rotate", "scale",
  "draw",
  "add", "sceneChange", "parentChange",
  "meshAdd", "meshRemove");

export class ObjectVectorProperty extends Vec3 {
  obj: any;
  _x: number = 0;
  _y: number = 0;
  _z: number = 0;
  eventName?: string;
  changeEvent?: any;

  constructor(obj: any, eventName?: string, defValue?: Vec3) {
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

  override get x(): number { return this._x; }
  override set x(val: number) {
    if (this._x !== val) {
      this._x = val;
      this.notifyObj();
    }
  }

  override get y(): number { return this._y; }
  override set y(val: number) {
    if (this._y !== val) {
      this._y = val;
      this.notifyObj();
    }
  }

  override get z(): number { return this._z; }
  override set z(val: number) {
    if (this._z !== val) {
      this._z = val;
      this.notifyObj();
    }
  }

  override set(arg0: any, arg1?: number, arg2?: number): void {
    switch (arguments.length) {
      case 1:
        this.setVec3(arg0);
        break;

      case 3:
        this.setXYZ(arg0, arg1!, arg2!);
        break;
    }
  }

  setVec3(v: any): void {
    if (Array.isArray(v)) {
      const [x, y, z] = v;
      this.setXYZ(x, y, z);
    } else if (typeof v === "object") {
      const { x, y, z } = v;
      this.setXYZ(x, y, z);
    }
  }

  setXYZ(x: number, y: number, z: number): void {
    if (this._x !== x || this._y !== y || this._z !== z) {
      this._x = x;
      this._y = y;
      this._z = z;
      this.notifyObj();
    }
  }

  notifyObj(): void {
    if (this.obj) {
      this.obj.invalidateTransform();
      if (this.changeEvent) this.changeEvent.call(this.obj);
    }
  }
}

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

  // The Sun is a directional light at infinity, so only its *direction* carries
  // meaning — the underlying `location` is just storage and its magnitude is
  // irrelevant. `direction` is the natural way to aim it: a (normalized) vector
  // pointing toward the sun, the same convention the water shader and LensFlare
  // read as "sundir".
  //
  //   scene.sun.direction = [0, 0.1, -1];   // low sun, straight ahead
  get direction(): Vec3 {
    return Vec3.normalize(this.worldLocation);
  }
  set direction(v: any) {
    const x = v.x !== undefined ? v.x : v[0];
    const y = v.y !== undefined ? v.y : v[1];
    const z = v.z !== undefined ? v.z : v[2];
    this._location.set(x, y, z);
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
  jointMatrix: Matrix4;
  _jointWorldRotation: Matrix4;

  constructor() {
    super();

    this.type = ObjectTypes.Joint;
    this.jointMatrix = new Matrix4();
    this._jointWorldRotation = new Matrix4();
  }

  override updateTransform(): void {

    if (this.jointMatrix) {
      this.updateJoint();
    }

    super.updateTransform();

  }

  updateJoint(): void {
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

  get jointWorldRotation(): Matrix4 {
    return this._jointWorldRotation;
  }

  override draw(g: any): void {
    // const p = this.location.mulMat(this.skin.inverseMatrices[i].mul(this.jointMatrix));
    // g.drawPoint(this.worldLocation, 10, this.skin ? 'red' : 'silver');
  }
}
