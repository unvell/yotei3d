// Type surface for the vendored graphics-math library (./index.js).
//
// The runtime is plain ES6 JS under src/js/math/ (checkJs is off, so these
// .js files are not type-checked). This adjacent index.d.ts is what TS uses
// for imports of "@/math" — it takes precedence over inference from index.js,
// so e.g. Vec3.x/y/z stay declared as accessors (ObjectVectorProperty in
// scene/object.ts overrides them as get/set). Typed pragmatically: it covers
// the surface the engine uses — extend it as needed.

export class Vec2 {
  x: number;
  y: number;
  constructor(x?: number, y?: number);
  clone(): Vec2;
  static get zero(): Vec2;
}

export class Vec3 {
  // Declared as accessors so subclasses (e.g. ObjectVectorProperty) may
  // override x/y/z with their own get/set without a property-vs-accessor clash.
  get x(): number; set x(v: number);
  get y(): number; set y(v: number);
  get z(): number; set z(v: number);
  constructor(x?: number | Vec3, y?: number, z?: number);
  clone(): Vec3;
  equals(x: number, y: number, z: number): boolean;
  normalize(): Vec3;
  mulMat(m: Matrix4): Vec3;
  toArrayDigits(digits?: number): number[];
  add(v: Vec3): Vec3;
  sub(v: Vec3): Vec3;
  mul(s: number): Vec3;
  neg(): Vec3;
  abs(): Vec3;
  length(): number;
  dot(v: Vec3): number;
  cross(v: Vec3): Vec3;
  lerp(v2: Vec3, t: number): Vec3;
  offset(x: number | { x: number; y: number; z: number }, y?: number, z?: number): Vec3;
  set(x: number | Vec3 | number[], y?: number, z?: number): void;
  static get zero(): Vec3;
  static get one(): Vec3;
  static get One(): Vec3;
  static up: Vec3;
  static down: Vec3;
  static forward: Vec3;
  static back: Vec3;
  static add(a: Vec3, b: Vec3): Vec3;
  static sub(a: Vec3, b: Vec3): Vec3;
  static mul(a: Vec3, s: number): Vec3;
  static neg(a: Vec3): Vec3;
  static lerp(a: Vec3, b: Vec3, t: number): Vec3;
  static dot(a: Vec3, b: Vec3): number;
  static cross(a: Vec3, b: Vec3): Vec3;
  static length(v: Vec3): number;
  static normalize(v: Vec3): Vec3;
  static fromArray(arr: ArrayLike<number>): Vec3;
}

export class Vec4 {
  x: number;
  y: number;
  z: number;
  w: number;
  constructor(x?: Vec3 | Vec4 | number, y?: number, z?: number, w?: number);
  readonly xyz: Vec3;
  clone(): Vec4;
  mulMat(m: Matrix4): Vec4;
}

export class Matrix3 {
  a1: number; a2: number; a3: number;
  b1: number; b2: number; b3: number;
  c1: number; c2: number; c3: number;
  constructor();
  loadIdentity(): Matrix3;
  clone(): Matrix3;
  mul(m: Matrix3): Matrix3;
  static makeTranslation(x: number, y: number): Matrix3;
  static makeRotation(angle: number, x?: number, y?: number): Matrix3;
}

export class Matrix4 {
  a1: number; a2: number; a3: number; a4: number;
  b1: number; b2: number; b3: number; b4: number;
  c1: number; c2: number; c3: number; c4: number;
  d1: number; d2: number; d3: number; d4: number;
  constructor();
  loadIdentity(): Matrix4;
  extractEulerAngles(): Vec3;
  copyFrom(m: Matrix4): Matrix4;
  clone(): Matrix4;
  mul(m: Matrix4): Matrix4;
  inverse(): Matrix4;
  invertInPlace(): Matrix4;
  transpose(): Matrix4;
  transposeInPlace(): Matrix4;
  equals(m: Matrix4): boolean;
  approxiEquals(m: Matrix4, epsilon?: number): boolean;
  translate(x: number, y: number, z: number): Matrix4;
  rotate(x: number | Vec3, y?: number, z?: number, order?: string): Matrix4;
  rotateX(angle: number): Matrix4;
  rotateY(angle: number): Matrix4;
  rotateZ(angle: number): Matrix4;
  scale(x: number, y: number, z: number): Matrix4;
  lookAt(location: Vec3, target: Vec3, up: Vec3): Matrix4;
  extractLookAtVectors(): { dir: Vec3; up: Vec3 };
  toArray(): number[];
  static Identity: Matrix4;
}

export class Quaternion {
  x: number;
  y: number;
  z: number;
  w: number;
  constructor(x?: number, y?: number, z?: number, w?: number);
  length(): number;
  normalize(): Quaternion;
  toMatrix(): Matrix4;
  toArray(): number[];
  setFromEuler(euler: { x: number; y: number; z: number } | number[], order?: string): Quaternion;
  setFromRotationMatrix(m: Matrix4): Quaternion;
  static fromEuler(euler: { x: number; y: number; z: number } | number[], order?: string): Quaternion;
  static fromRotationMatrix(m: Matrix4): Quaternion;
  static slerp(q1: Quaternion, q2: Quaternion, t: number): Quaternion;
  static multiply(a: Quaternion, b: Quaternion): Quaternion;
  static zero: Quaternion;
}

export class Color3 {
  r: number;
  g: number;
  b: number;
  constructor(r?: number, g?: number, b?: number);
  clone(): Color3;
}

export class Color4 {
  r: number;
  g: number;
  b: number;
  a: number;
  constructor(r?: number, g?: number, b?: number, a?: number);
  clone(): Color4;
}

export class BoundingBox2D {
  constructor();
}

export class BoundingBox3D {
  min: Vec3;
  max: Vec3;
  origin: Vec3;
  size: Vec3;
  constructor(a?: any, b?: any);
  expandTo(p: { x: number; y: number; z: number }): void;
  static findBoundingBoxOfBoundingBoxes(a: any, b: any): BoundingBox3D;
  static transformBoundingBox(bbox: any, m: Matrix4): BoundingBox3D;
}

export class Ray {
  origin: Vec3;
  dir: Vec3;
  constructor(origin?: Vec3, dir?: Vec3);
  static MaxDistance: number;
}

export const MathFunctions: {
  clamp(v: number, min: number, max: number): number;
  smoothstep(min: number, max: number, v: number): number;
  [key: string]: any;
};
export const MathFunctions2: { [key: string]: any };
export const MathFunctions3: { [key: string]: any };
