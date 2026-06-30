import { CameraController } from '@';
import { Vec3 } from '@/math';
import type { CameraState } from '../aircraft/FlightModel';

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export interface FlightChaseOptions {
  getState: () => CameraState; // live flight pose
  distance?: number;
  minDistance?: number;
  maxDistance?: number;
  restEl?: number;
  lookAhead?: number;
  zoomSpeed?: number;
  lookSens?: number;
  returnDelay?: number;
  returnEase?: number;
  followEase?: number;
}

/**
 * FlightChaseController — a dedicated "behind-the-jet" camera (racing / flight
 * game style), as opposed to a free orbit camera:
 *   • locks to a point behind + above the jet,
 *   • banks AND pitches WITH the airframe (the horizon rolls when you bank),
 *   • scroll to zoom (dolly in/out along the back vector),
 *   • drag (mouse or touch) to look around — orbit the eye to see the jet's
 *     left/right flanks — held the whole time the pointer is down, then eases
 *     back behind the jet a moment (returnDelay) after you release / lift off.
 *
 * It reads the live flight state via a getState() callback ({ x,y,z, heading,
 * pitch, roll } in world units / degrees) and positions the camera every frame
 * from the renderer's controller tick. Extracted unchanged from landing-p2.html.
 */
export class FlightChaseController extends CameraController {
  getState: () => CameraState;
  distance: number;
  minDistance: number;
  maxDistance: number;
  restEl: number;
  lookAhead: number;
  zoomSpeed: number;
  lookSens: number;
  returnDelay: number;
  returnEase: number;
  followEase: number;

  private az = 0;
  private el: number;
  private _sinceDrag = 1e3;
  private _cam: { x: number; y: number; z: number } | null = null;
  private _pressed = false;
  private _release: () => void;

  constructor(opts: FlightChaseOptions) {
    super();
    this.getState = opts.getState;
    this.distance = opts.distance ?? 64;
    this.minDistance = opts.minDistance ?? 18;
    this.maxDistance = opts.maxDistance ?? 600;
    this.restEl = opts.restEl ?? 15;
    this.lookAhead = opts.lookAhead ?? 2;
    this.zoomSpeed = opts.zoomSpeed ?? 10;
    this.lookSens = opts.lookSens ?? 0.3;
    this.returnDelay = opts.returnDelay ?? 0.6;
    this.returnEase = opts.returnEase ?? 2.5;
    this.followEase = opts.followEase ?? 9;

    this.el = this.restEl;

    // Guard on _pressed so a release elsewhere (e.g. lifting an on-screen pad
    // button) doesn't reset the recenter timer when the camera wasn't dragged.
    this._release = () => {
      if (this._pressed) {
        this._pressed = false;
        this._sinceDrag = 0;
      }
    };
  }

  protected override onAttach(): void {
    this.bind('drag', () => this._onDrag());
    this.bind('mousewheel', () => this._onWheel());
    // Press / release tracking so the free-look is held the WHOLE time the
    // pointer is down (even motionless) and only re-centres after it lifts.
    this.bind('mousedown', () => {
      this._pressed = true;
      this._sinceDrag = 0;
    });
    this.bind('enddrag', this._release);
    this.bind('mouseup', this._release);
    if (typeof window !== 'undefined') {
      for (const ev of ['pointerup', 'pointercancel', 'touchend', 'touchcancel', 'mouseup'])
        window.addEventListener(ev, this._release);
    }
  }

  protected override onDetach(): void {
    if (typeof window !== 'undefined') {
      for (const ev of ['pointerup', 'pointercancel', 'touchend', 'touchcancel', 'mouseup'])
        window.removeEventListener(ev, this._release);
    }
    this._pressed = false;
  }

  private _onDrag(): void {
    if (!this.isActive()) return;
    const mv = this.input.mouse.movement; // pixel delta this step
    this.az = clamp(this.az - mv.x * this.lookSens, -170, 170);
    this.el = clamp(this.el + mv.y * this.lookSens, -35, 80);
    this._sinceDrag = 0;
    if (this.scene) this.scene.requireUpdateFrame();
  }

  private _onWheel(): void {
    if (!this.isActive()) return;
    const wd = this.input.mouse.wheeldelta;
    this.distance = clamp(
      this.distance + (wd > 0 ? -1 : 1) * this.zoomSpeed,
      this.minDistance,
      this.maxDistance,
    );
    if (this.scene) this.scene.requireUpdateFrame();
  }

  override update(dt: number): void {
    const s = this.getState && this.getState();
    if (!s) return;

    // Hold the free-look the whole time the pointer is down — even if you stop
    // moving — and only ease back behind the jet a moment after you release.
    if (this._pressed) {
      this._sinceDrag = 0;
    } else {
      this._sinceDrag += dt;
      if (this._sinceDrag > this.returnDelay) {
        const k = Math.min(1, this.returnEase * dt);
        this.az += (0 - this.az) * k;
        this.el += (this.restEl - this.el) * k;
      }
    }

    // --- jet body frame in world: nose N, up U, right R (yaw→pitch→roll) ---
    const D = Math.PI / 180;
    const ch = Math.cos(s.heading * D),
      sh = Math.sin(s.heading * D);
    const cp = Math.cos(s.pitch * D),
      sp = Math.sin(s.pitch * D);
    const cr = Math.cos(s.roll * D),
      sr = Math.sin(s.roll * D);
    // yaw
    const Nx = -sh,
      Nz = -ch;
    const Rx = ch,
      Rz = -sh;
    // pitch about R
    const Nfx = Nx * cp,
      Nfy = sp,
      Nfz = Nz * cp;
    const U2x = -Nx * sp,
      U2y = cp,
      U2z = -Nz * sp;
    // roll about N
    const Ux = U2x * cr + Rx * sr,
      Uy = U2y * cr,
      Uz = U2z * cr + Rz * sr;
    const Rxx = Rx * cr - U2x * sr,
      Ryy = -U2y * sr,
      Rzz = Rz * cr - U2z * sr;

    // --- eye offset direction (jet → camera) from az/el in that body frame ---
    const az = this.az * D,
      el = this.el * D;
    const caz = Math.cos(az),
      saz = Math.sin(az),
      cel = Math.cos(el),
      sel = Math.sin(el);
    const dx = -Nfx * cel * caz + Rxx * cel * saz + Ux * sel;
    const dy = -Nfy * cel * caz + Ryy * cel * saz + Uy * sel;
    const dz = -Nfz * cel * caz + Rzz * cel * saz + Uz * sel;

    const ex = s.x + dx * this.distance;
    const ey = s.y + dy * this.distance;
    const ez = s.z + dz * this.distance;

    // smooth follow so turns/zoom/recenter glide instead of snapping
    if (!this._cam) this._cam = { x: ex, y: ey, z: ez };
    const f = Math.min(1, this.followEase * dt);
    this._cam.x += (ex - this._cam.x) * f;
    this._cam.y += (ey - this._cam.y) * f;
    this._cam.z += (ez - this._cam.z) * f;

    const cam = this.camera;
    cam.location.set(this._cam.x, this._cam.y, this._cam.z);
    // look just ahead of the jet; up = body-up so the view banks with the jet
    cam.lookAt(
      new Vec3(s.x + Nfx * this.lookAhead, s.y + Nfy * this.lookAhead, s.z + Nfz * this.lookAhead),
      new Vec3(Ux, Uy, Uz),
    );

    if (this.scene) this.scene.requireUpdateFrame();
  }
}
