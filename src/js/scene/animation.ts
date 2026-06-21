
import { Vec3, MathFunctions } from "@/math";
import { EventDispatcher } from '../utility/event';

interface AnimationOptions {
  name?: string;
  effect?: string;
  duration?: number;
  delay?: number;
  repeat?: number;
}

type FrameHandler = (t: number) => void;

class Animation {
  scene: any;

  startTime?: number;
  endTime?: number;

  duration: number;
  delay: number;
  repeat: number;

  isPausedOrStop: boolean;
  elapsedTime: number;
  repeatCount: number;
  initialized: boolean;
  name: string;

  /** Per-frame callback; required before play(). */
  onframe?: FrameHandler;
  /** Easing mode read by tick(); falls back to "smooth". */
  effect?: string;

  // internal timing state
  private _msDuration!: number;
  private _lastCheckedTime?: number;
  private _inDelay!: boolean;

  // --- members injected by the EventDispatcher mixin (see bottom of file) ---
  declare on: (event: string, listener: (...args: any[]) => any) => any;
  declare addEventListener: (event: string, listener: (...args: any[]) => any) => any;
  declare removeEventListener: (event: string, listener: (...args: any[]) => any) => void;
  declare onfinish: (...args: any[]) => any;
  declare onpause: (...args: any[]) => any;
  declare onplay: (...args: any[]) => any;
  declare onstop: (...args: any[]) => any;

  constructor(scene: any, options: AnimationOptions, onframe?: FrameHandler, onfinish?: (...args: any[]) => any) {
    this.scene = scene;

    this.startTime = undefined;
    this.endTime = undefined;

    const _options = { ...Animation.DefaultOptions, ...options };
    this.duration = _options.duration || 1;
    this.delay = _options.delay || 0;
    this.repeat = _options.repeat || 0;

    this.isPausedOrStop = false;
    this.elapsedTime = 0;
    this.repeatCount = 0;
    this.initialized = false;

    if (typeof options.name === "string" && options.name.length > 0) {
      this.name = options.name;
    } else {
      this.name = Animation.getAvailableDefaultName();
    }

    if (typeof onframe === "function") {
      this.onframe = onframe;
    }

    if (typeof onfinish === "function") {
      this.on("finish", onfinish);
    }
  }

  get progressRate(): number {
    if (this._inDelay) return 0;
    return this.elapsedTime / this._msDuration;
  }

  get isPlaying(): boolean {
    return !this.isPausedOrStop && this.elapsedTime < this.duration * 1000;
  }

  get isDuringDelay(): boolean {
    return this._inDelay;
  }

  get isFinished(): boolean {
    return this.elapsedTime >= this._msDuration;
  }

  initialize(): void {
    this._msDuration = this.duration * 1000;
    this._lastCheckedTime = undefined;

    this._inDelay = this.delay > 0;

    this.startTime = Date.now();
    this.endTime = this.startTime + this.duration * 1000;

    this.initialized = true;
  }

  play(): void {
    if (this.delay) {
      setTimeout(() => this.play(), this.delay * 1000);
      this.delay = 0;
      return;
    }

    if (typeof this.onframe !== "function") {
      throw Error("must specify the onframe function to start animation.");
    }

    if (!this.initialized) {
      this.initialize();
    }

    if (typeof this.name === "string" && this.name.length > 0) {
      Animation.cancelAnimationByName(this.name);
      Animation.RunningAnimations[this.name] = this;
    }

    // resume animation when play is called
    this.isPausedOrStop = false;
    this._lastCheckedTime = Date.now();

    // this.createAnimationTimer();
    requestAnimationFrame(() => this.tick());
  }

  tick(): void {
    const now = Date.now();
    const diff = now - this._lastCheckedTime!;
    this._lastCheckedTime = now;

    if (this.isPausedOrStop) return;

    this.elapsedTime += diff;

    if (this._inDelay) {
      if (this.elapsedTime < this.delay * 1000) {
        return;
      } else {
        this._inDelay = false;
        this.elapsedTime = 0;
      }
    }

    if (this.elapsedTime < this._msDuration) {
      let t = this.elapsedTime / this._msDuration;

      switch (this.effect) {
        default:
        case "smooth":
          t = MathFunctions.smoothstep(0, 1, t);
          break;

        case "sharp":
          t = MathFunctions.smoothstep(0.2, 0.8, t);
          break;

        case "fadein":
          t = 1 - Math.cos(Math.PI / 2 * t);
          break;

        case "fadeout":
          t = Math.sin(Math.PI / 2 * t);
          break;
      }

      this.onframe!(t);
      if (this.scene) this.scene.requireUpdateFrame();

      requestAnimationFrame(() => this.tick());
      return;
    }

    if (!isFinite(this.repeat)) {
      this.elapsedTime = 0;
      return;
    } else if (this.repeat > 1) {
      this.repeatCount++;

      if (this.repeatCount < this.repeat) {
        this.elapsedTime = 0;
        return;
      }
    }

    this.onframe!(1);
    if (this.scene) this.scene.requireUpdateFrame();

    this.removeAnimationTimer();
    this.onfinish();
  }

  removeAnimationTimer(): void {
    if (typeof this.name === "string" && this.name.length > 0) {
      const previousInstance = Animation.RunningAnimations[this.name];
      if (previousInstance) {
        previousInstance.isPausedOrStop = true;
        delete Animation.RunningAnimations[this.name];
      }
    }
  }

  stop(): void {
    this.removeAnimationTimer();
    this.onstop();
  }

  pause(): void {
    this.isPausedOrStop = true;
    this.onpause();
  }

  reset(): void {
    this.elapsedTime = 0;
  }

  static DefaultOptions = {
    effect: "smooth",
    duration: 1,
    delay: 0,
    repeat: 0,
  };

  static Interval = 10;  // ms

  static Effects = {
    Normal: 0,
    Smooth: 1,
    Sharp: 2,
    FadeIn: 3,
    FadeOut: 4,
  };

  static RunningAnimations: { [name: string]: Animation } = {};

  static PropertyChanger: typeof PropertyChanger;

  static isAnyAnimationPlaying(): boolean {
    return !(Animation.RunningAnimations as any)._s3_isEmpty();
  }

  static isAnimationPlaying(name: string): boolean {
    return Animation.RunningAnimations.hasOwnProperty(name);
  }

  static cancelAnimationByName(name: string): void {
    const previousInstance = Animation.RunningAnimations[name];
    if (previousInstance) {
      delete Animation.RunningAnimations[name];
    }
  }

  static getAvailableDefaultName(): string {
    let name: string | undefined;
    while (name === undefined || Animation.RunningAnimations.hasOwnProperty(name)) {
      name = "__unnamed" + Date.now() + Math.floor(Math.random());
    }
    return name;
  }
}

interface PropertyChangerDefine {
  object: any;
  property: string | (() => string);
  start?: any;
  end?: any;
}

class PropertyChanger {
  define: PropertyChangerDefine;
  options: any;

  object: any;
  property!: string;
  value: any;
  valueType?: string;
  startValue: any;
  endValue: any;

  constructor(define: PropertyChangerDefine, options: any) {
    this.define = define;
    this.options = options;
  }

  start(): void {
    const define = this.define;

    this.object = typeof define.object === "function" ? define.object() : define.object;
    this.property = typeof define.property === "function" ? define.property() : define.property;

    this.value = this.object[this.property];
    this.valueType = typeof this.value;

    if (typeof define.start === "function") {
      this.startValue = define.start(this.value);
    } else if (typeof define.start !== "undefined") {
      this.startValue = define.start;
    } else {
      if (this.value instanceof Vec3) {
        this.startValue = new Vec3(this.value);
      } else {
        this.startValue = this.value;
      }
    }

    this.endValue = typeof define.end === "function" ? define.end(this.value) : define.end;
  }

  frame(t: number): void {
    if (this.value instanceof Vec3) {
      this.object[this.property] = Vec3.lerp(this.startValue, this.endValue, t);
    } else if (this.valueType === "number") {
      this.object[this.property] = (this.startValue + (this.endValue - this.startValue) * t);
    }
  }
}

Animation.PropertyChanger = PropertyChanger;

new EventDispatcher(Animation).registerEvents(
  "finish", "pause", "play", "stop"
);

class Storyboard {
  scene: any;
  keyframes: any[];
  keyStep: number;
  playing: boolean;
  currentAnimation: any;

  // --- members injected by the EventDispatcher mixin (see bottom of file) ---
  declare onkeyframeBegin: (...args: any[]) => any;
  declare onkeyframeEnd: (...args: any[]) => any;
  declare onfinish: (...args: any[]) => any;

  constructor(scene: any, timeline?: any[]) {
    this.scene = scene;
    this.keyframes = [];
    this.keyStep = 0;
    this.playing = false;
    this.currentAnimation = null;

    if (Array.isArray(timeline)) {
      for (const keyframe of timeline) {
        this.add(keyframe);
      }
    }
  }

  add(keyframe: any): void {
    this.keyframes.push(keyframe);
  }

  play(): void {
    if (!this.playing) {
      this.playing = true;
      this.playNextKeyFrame();
    }
  }

  stop(): void {
    if (this.currentAnimation) {
      this.currentAnimation.stop();
    }
    this.keyStep = 0;
    this.playing = false;
  }

  playNextKeyFrame(): void {
    const keyframe = this.keyframes[this.keyStep];
    keyframe.start();
    this.onkeyframeBegin(keyframe, this.keyStep);

    this.currentAnimation = this.scene.animate(keyframe.options, (t: number) => {
      keyframe.frame(t, this.keyStep);
    }, () => {
      this.onkeyframeEnd(keyframe, this.keyStep);

      this.keyStep++;

      if (this.keyStep < this.keyframes.length) {
        this.playNextKeyFrame();
      } else {
        this.currentAnimation = null;
        this.stop();

        this.onfinish(this.keyStep);
      }
    });
  }
}

new EventDispatcher(Storyboard).registerEvents(
  "keyframeBegin", "keyframeEnd", "finish",
);

export { Animation, Storyboard };
