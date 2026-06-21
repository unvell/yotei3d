// Ambient type declarations for @jingwood/graphics-math.
// The upstream package ships no .d.ts; this covers the surface the engine uses.
// Members are typed pragmatically — extend as the TS migration progresses.
declare module '@jingwood/graphics-math' {
  export class Vec2 {
    x: number;
    y: number;
    constructor(x?: number, y?: number);
    clone(): Vec2;
    static get zero(): Vec2;
  }

  export class Vec3 {
    x: number;
    y: number;
    z: number;
    constructor(x?: number | Vec3, y?: number, z?: number);
    clone(): Vec3;
    equals(x: number, y: number, z: number): boolean;
    normalize(): Vec3;
    mulMat(m: Matrix4): Vec3;
    toArrayDigits(digits?: number): number[];
    static get zero(): Vec3;
    static get one(): Vec3;
    static get One(): Vec3;
    static add(a: Vec3, b: Vec3): Vec3;
    static sub(a: Vec3, b: Vec3): Vec3;
    static lerp(a: Vec3, b: Vec3, t: number): Vec3;
    static dot(a: Vec3, b: Vec3): number;
    static cross(a: Vec3, b: Vec3): Vec3;
  }

  export class Vec4 {
    x: number;
    y: number;
    z: number;
    w: number;
    constructor(v?: Vec3 | number, w?: number);
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
    constructor();
    loadIdentity(): Matrix4;
    copyFrom(m: Matrix4): Matrix4;
    clone(): Matrix4;
    mul(m: Matrix4): Matrix4;
    inverse(): Matrix4;
    transpose(): Matrix4;
    translate(x: number, y: number, z: number): Matrix4;
    rotate(x: number, y: number, z: number, order?: string): Matrix4;
    scale(x: number, y: number, z: number): Matrix4;
  }

  export class Quaternion {
    x: number;
    y: number;
    z: number;
    w: number;
    constructor(x?: number, y?: number, z?: number, w?: number);
    toMatrix(): Matrix4;
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
    constructor(origin?: Vec3, dir?: Vec3);
  }

  export const MathFunctions: {
    clamp(v: number, min: number, max: number): number;
    smoothstep(min: number, max: number, v: number): number;
    [key: string]: any;
  };
  export const MathFunctions2: { [key: string]: any };
  export const MathFunctions3: { [key: string]: any };
}
