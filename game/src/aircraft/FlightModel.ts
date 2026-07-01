import { Vec3 } from '@/math';
import type { Controls } from '../input/controls';
import { AERO, START } from './tunables';
import { liftCoeff, dragCoeff, trimPitchDeg, trimThrottle } from './aero';

const DEG = Math.PI / 180;

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/** Live camera-facing pose, in world units / degrees. */
export interface CameraState {
  x: number;
  y: number;
  z: number;
  heading: number;
  pitch: number;
  roll: number;
}

/**
 * Angle-of-attack point-mass flight model (longitudinal / vertical plane).
 *
 * The key realism over the old arcade model: the nose attitude (θ = `pitch`) and
 * the actual flight path (γ = `gamma`, the direction the jet is *moving*) are
 * separate. Their difference is the angle of attack α = θ − γ — how hard the wing
 * bites the air. Lift comes from α and speed (L ∝ V²·CL(α)); the lift, drag,
 * thrust and weight together curve the velocity vector (γ̇) and change speed (V̇).
 *
 * Pitch is a *rate* command that leaves a persistent attitude: hold ↓ and the
 * nose keeps rotating up and stays there on release — to level off you push the
 * other way. Pull too hard / too slow and α passes the stall angle: lift collapses
 * and the jet sinks. This makes climbs bleed speed, dives build it, and stalls
 * emerge naturally — instead of the old "instant climb, auto-return to level".
 *
 * Lateral motion (yaw + a visual bank) is kept simple/coordinated, as before.
 */
export class FlightModel {
  readonly pos = new Vec3(START.x, START.y, START.z);
  heading = START.heading; // deg (0 = toward world −Z)
  pitch = trimPitchDeg(START.speed); // θ — nose attitude (deg, +up), persistent
  gamma = 0; // γ — flight-path angle (deg, +climb)
  alpha = this.pitch; // α = θ − γ — angle of attack (deg)
  roll = 0; // deg (visual bank)
  speed = START.speed; // V — airspeed (u/s)
  throttle = trimThrottle(START.speed); // 0..1

  // derived, exposed for the HUD
  stallT = 0; // 0 (clean) → 1 (at/over the stall angle)
  stalled = false;

  /** Return the jet to the start of the approach, trimmed for START.speed. */
  reset(): void {
    this.pos.set(START.x, START.y, START.z);
    this.heading = START.heading;
    this.gamma = 0;
    this.pitch = trimPitchDeg(START.speed);
    this.alpha = this.pitch;
    this.roll = 0;
    this.speed = START.speed;
    this.throttle = trimThrottle(START.speed);
    this.stallT = 0;
    this.stalled = false;
  }

  /** Drop the jet onto a given approach point, trimmed for `spd` (debug/framing). */
  place(z: number, y: number, spd: number): void {
    this.pos.set(0, y, z);
    this.heading = 0;
    this.gamma = 0;
    this.speed = spd;
    this.pitch = trimPitchDeg(spd);
    this.alpha = this.pitch;
    this.throttle = trimThrottle(spd);
  }

  getCameraState(): CameraState {
    return {
      x: this.pos.x,
      y: this.pos.y,
      z: this.pos.z,
      heading: this.heading,
      pitch: this.pitch,
      roll: this.roll,
    };
  }

  /** Advance one frame. `dt` is seconds (caller clamps big gaps). */
  update(dt: number, ctrl: Controls): void {
    const A = AERO;

    // --- throttle axis (−1..+1) → thrust OR airbrake ---
    // Above 0 the throttle is engine thrust; below 0 (hold S past idle) it stows
    // thrust and deploys the speedbrake instead — the drag term is added below.
    this.throttle += ((ctrl.thrUp ? 1 : 0) - (ctrl.thrDown ? 1 : 0)) * A.THR_RATE * dt;
    this.throttle = clamp(this.throttle, -1, 1);
    const T = Math.max(0, this.throttle) * A.THRUST_MAX;
    const airbrake = Math.max(0, -this.throttle); // 0..1 speedbrake deployment

    // --- pitch: a RATE command that leaves a persistent attitude (no auto-return).
    //     down = pull up = nose up (+); up = push down = nose down (−). The wing
    //     won't follow far past the stall, so elevator authority fades as the angle
    //     of attack nears the AoA limit (fly-by-wire envelope, not a return). ---
    let elevator = (ctrl.down ? 1 : 0) - (ctrl.up ? 1 : 0);
    const aoaNow = this.pitch - this.gamma;
    if (elevator > 0) {
      elevator *= clamp((A.AOA_LIMIT - aoaNow) / A.AOA_LIMIT_BAND, 0, 1); // limit +AoA
    } else if (elevator < 0) {
      elevator *= clamp((A.AOA_LIMIT + aoaNow) / A.AOA_LIMIT_BAND, 0, 1); // limit −AoA
    }
    this.pitch = clamp(this.pitch + elevator * A.PITCH_RATE * dt, A.PITCH_MIN, A.PITCH_MAX);

    // --- stall break / longitudinal stability: past the AoA limit the nose drops
    //     back toward the velocity vector, the way a real airframe pitches down at
    //     the stall. This keeps the angle of attack from running away (e.g. holding
    //     the stick back while the flight path falls) into an unrealistic deep-stall
    //     falling-leaf. Below the limit it never fires, so normal attitude persists. ---
    this.alpha = this.pitch - this.gamma;
    if (this.alpha > A.AOA_LIMIT) {
      this.pitch += (this.gamma + A.AOA_LIMIT - this.pitch) * Math.min(1, A.STALL_BREAK * dt);
    } else if (this.alpha < -A.AOA_LIMIT) {
      this.pitch += (this.gamma - A.AOA_LIMIT - this.pitch) * Math.min(1, A.STALL_BREAK * dt);
    }

    // --- angle of attack and the aero forces (per unit mass) ---
    this.alpha = this.pitch - this.gamma;
    const aRad = this.alpha * DEG;
    const gRad = this.gamma * DEG;
    const cl = liftCoeff(this.alpha);
    const cd = dragCoeff(cl) + A.AIRBRAKE_CD * airbrake; // speedbrake adds parasitic drag
    const q = A.QS * this.speed * this.speed; // dynamic pressure factor
    const L = q * cl;
    const D = q * cd;
    const W = A.G;

    // longitudinal point-mass equations of motion:
    //   V̇   = ( T·cosα − D − W·sinγ )
    //   γ̇   = ( L + T·sinα − W·cosγ ) / V        (curves the velocity vector)
    const Vdot = T * Math.cos(aRad) - D - W * Math.sin(gRad);
    const Vsafe = Math.max(this.speed, A.V_MIN);
    const gammaDotRad = (L + T * Math.sin(aRad) - W * Math.cos(gRad)) / Vsafe;

    this.speed = Math.max(this.speed + Vdot * dt, A.V_MIN);
    this.gamma += (gammaDotRad / DEG) * dt; // rad/s → deg/s

    // --- stall metrics (now AoA-based, not speed-based) ---
    const absA = Math.abs(this.alpha);
    this.stallT = clamp((absA - (A.ALPHA_STALL - A.STALL_WARN_MARGIN)) / A.STALL_WARN_MARGIN, 0, 1);
    this.stalled = absA >= A.ALPHA_STALL;

    // --- lateral: yaw + coordinated visual bank (unchanged feel) ---
    const authority = 1 - 0.5 * this.stallT;
    const yawIn = (ctrl.right ? 1 : 0) - (ctrl.left ? 1 : 0);
    this.heading -= yawIn * A.YAW_RATE * authority * dt;
    const rollTarget = yawIn * A.MAX_BANK * authority;
    this.roll += (rollTarget - this.roll) * Math.min(1, 3 * dt);

    // --- integrate position from speed + flight-path angle + heading ---
    const g2 = this.gamma * DEG;
    const horiz = this.speed * Math.cos(g2);
    const vy = this.speed * Math.sin(g2);
    const hr = this.heading * DEG;
    this.pos.x += -Math.sin(hr) * horiz * dt;
    this.pos.z += -Math.cos(hr) * horiz * dt;
    this.pos.y += vy * dt;

    // sea-surface guard: don't sink through the water; level the path if we hit.
    if (this.pos.y < A.MIN_ALT) {
      this.pos.y = A.MIN_ALT;
      if (this.gamma < 0) this.gamma = 0;
    }
  }
}
