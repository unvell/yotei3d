import { Vec3 } from '@/math';
import type { Controls } from '../input/controls';
import { FLIGHT, START } from './tunables';

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
 * Arcade flight model for the F-2 — pure simulation, no engine/DOM coupling, so
 * it can be unit-tested and reused. Ported verbatim from landing-p2.html's frame
 * loop, just reorganised into a class with the tunables in ./tunables.ts.
 *
 * Vertical motion is a lift-vs-weight model: lift ∝ speed², so at/above
 * TRIM_SPEED level flight (pitch 0) holds altitude, and below it the lift deficit
 * makes the jet sink more and more → a gradual, believable descent. Stall is a
 * smooth ramp (stallT) below STALL_SPEED: control authority fades and the nose
 * droops, both blended in. Fly an approach by easing the throttle back so speed
 * drops below trim and the jet settles into a gentle sink.
 */
export class FlightModel {
  readonly pos = new Vec3(START.x, START.y, START.z);
  heading = START.heading; // deg (0 = toward world −Z)
  pitch = 0; // deg (+ climb)
  roll = 0; // deg (visual bank)
  speed = START.speed; // u/s
  throttle = START.throttle; // 0..1

  // derived, exposed for the HUD
  stallT = 0; // 0 (clean) → 1 (fully departed)
  stalled = false;

  /** Return the jet to the start of the approach. */
  reset(): void {
    this.pos.set(START.x, START.y, START.z);
    this.heading = START.heading;
    this.pitch = 0;
    this.roll = 0;
    this.speed = START.speed;
    this.throttle = START.throttle;
    this.stallT = 0;
    this.stalled = false;
  }

  /** Drop the jet onto a given approach point (debug / screenshot framing). */
  place(z: number, y: number, spd: number): void {
    this.pos.set(0, y, z);
    this.heading = 0;
    this.speed = spd;
    this.throttle = spd / FLIGHT.MAX_SPEED;
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
    const T = FLIGHT;

    // --- throttle ---
    this.throttle += ((ctrl.thrUp ? 1 : 0) - (ctrl.thrDown ? 1 : 0)) * T.THR_RATE * dt;
    this.throttle = clamp(this.throttle, 0, 1);
    const targetSpeed = this.throttle * T.MAX_SPEED;
    this.speed += (targetSpeed - this.speed) * Math.min(1, T.ACCEL * dt);

    // --- stall as a SMOOTH ramp, not an on/off switch: 0 well above the stall
    //     speed, easing to 1 at/below it over STALL_MARGIN. ---
    this.stallT = clamp((T.STALL_SPEED + T.STALL_MARGIN - this.speed) / T.STALL_MARGIN, 0, 1);
    this.stalled = this.stallT >= 1; // fully departed (drives the HUD warning)
    const authority = 1 - 0.7 * this.stallT; // control authority fades 1.0 → 0.3

    // --- steering: yaw (←/→ and A/D, identical effect; never stack) ---
    const yawIn = (ctrl.right ? 1 : 0) - (ctrl.left ? 1 : 0);
    this.heading -= yawIn * T.YAW_RATE * authority * dt;

    // --- pitch — up = push down (descend), down = pull up (climb). As the stall
    //     deepens the commanded pitch fades out and the nose is forced down. ---
    const climbIn = (ctrl.down ? 1 : 0) - (ctrl.up ? 1 : 0);
    let pitchTarget = climbIn * T.MAX_PITCH * authority;
    pitchTarget = pitchTarget * (1 - this.stallT) - T.STALL_DROP * this.stallT;
    this.pitch += (pitchTarget - this.pitch) * Math.min(1, T.PITCH_EASE * dt);

    // --- roll: a coordinated bank that follows the yaw turn and auto-levels. ---
    const rollTarget = yawIn * T.MAX_BANK * authority;
    this.roll += (rollTarget - this.roll) * Math.min(1, 3 * dt);

    // --- vertical motion (lift vs weight) ---
    const pr = this.pitch * DEG;
    const liftSupport = (this.speed * this.speed) / (T.TRIM_SPEED * T.TRIM_SPEED); // 1.0 at trim
    const gravSink = T.SINK_MAX * Math.max(0, 1 - liftSupport); // grows as you slow
    const vy = this.speed * Math.sin(pr) - gravSink;

    // --- integrate position ---
    const hr = this.heading * DEG;
    const fx = -Math.sin(hr);
    const fz = -Math.cos(hr); // forward in XZ
    const horiz = this.speed * Math.cos(pr);
    this.pos.x += fx * horiz * dt;
    this.pos.z += fz * horiz * dt;
    this.pos.y += vy * dt;
    if (this.pos.y < T.MIN_ALT) {
      this.pos.y = T.MIN_ALT;
      if (this.speed < T.STALL_SPEED) this.speed *= 0.98;
    }
  }
}
