// Ambient TypeScript types for the Yotei3D engine, which is consumed from source
// via the '@' alias (see game/vite.config.ts). The engine is mostly untyped JS,
// so this file hand-declares ONLY the subset the game touches. Members the game
// doesn't use are loosened to `any` via an index signature so this stays small.
//
// Runtime resolution is handled by Vite's '@' alias; these declarations exist
// purely so the game's own TypeScript stays type-checked and gets autocomplete.

declare module '@/math' {
  export class Vec3 {
    x: number;
    y: number;
    z: number;
    constructor(x?: number, y?: number, z?: number);
    set(x: number, y: number, z: number): void;
    clone(): Vec3;
    [k: string]: any;
  }
  export class Vec2 {
    x: number;
    y: number;
    constructor(x?: number, y?: number);
    [k: string]: any;
  }
  export const Color3: any;
  export const Color4: any;
}

declare module '@' {
  /** Anything Vec3-shaped the engine hangs on objects (location/angle/scale). */
  export interface Vec3Like {
    x: number;
    y: number;
    z: number;
    set(x: number, y: number, z: number): void;
    [k: string]: any;
  }

  export class SceneObject {
    name: string;
    visible: boolean;
    opacity: number;
    mat: any;
    location: Vec3Like;
    angle: Vec3Like;
    scale: Vec3Like;
    objects?: SceneObject[];
    constructor();
    add(obj: any): void;
    eachChild(fn: (child: any) => void): void;
    getBounds(): any;
    [k: string]: any;
  }

  export class Camera extends SceneObject {
    exposure: number;
    fieldOfView: number;
    controller: any;
    lookAt(target: any, up?: any): void;
  }

  export class Scene {
    mainCamera: Camera;
    environment: any;
    fog: any;
    skyFog: any;
    sun: any;
    animation: boolean;
    renderer: Renderer;
    add(obj: any): void;
    createObjectFromURL(url: string, cb: (root: any) => void, options?: any): void;
    createObjectFromObjFormat(url: string, cb: (obj: any) => void, options?: any): void;
    on(event: string, handler: (...args: any[]) => void): any;
    requireUpdateFrame(): void;
    show(): void;
    [k: string]: any;
  }

  export class Renderer {
    input: any;
    options: any;
    container: HTMLElement;
    constructor(options?: any);
    createScene(): Scene;
    [k: string]: any;
  }

  export class Ocean extends SceneObject {
    options: any;
    constructor(options?: any);
    update(): void;
  }

  export class HDRSkyBox {
    mat: any;
    intensity: number;
    constructor(renderer: Renderer, url: string, options?: any);
    [k: string]: any;
  }

  export class PointLight extends SceneObject {
    constructor();
  }

  export class LensFlare {
    constructor(scene: Scene, options?: any);
    [k: string]: any;
  }

  export class Texture {
    flipY: boolean;
    constructor(image?: any);
    [k: string]: any;
  }

  /** Base class for camera controllers (orbit / chase / fps / …). */
  export abstract class CameraController {
    camera: any;
    enabled: boolean;
    protected get scene(): any;
    protected get renderer(): any;
    protected get input(): any;
    protected bind(event: string, handler: (...args: any[]) => any, target?: any): void;
    protected isActive(): boolean;
    protected onAttach(): void;
    protected onDetach(): void;
    update(dt: number): void;
    tick(): void;
    attach(camera: any): void;
    detach(): void;
    dispose(): void;
  }

  export class OrbitController extends CameraController {
    target: any;
    constructor(options?: any);
    setTarget(t: any): void;
  }

  export const Shapes: {
    Sphere: new (segments?: number, rings?: number) => SceneObject;
    Plane: new (...args: any[]) => SceneObject;
    Cube: new (...args: any[]) => SceneObject;
    [k: string]: any;
  };
}
