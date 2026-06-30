// Pure aerodynamics — no state, no engine/DOM. The lift/drag curves and the trim
// helpers used by FlightModel and the HUD. Testable in isolation.

import { AERO } from './tunables';

const DEG = Math.PI / 180;

/**
 * Lift coefficient as a function of angle of attack (degrees).
 * Linear (CL = CL_α·α) up to the stall angle, then a soft peak that falls off to
 * a residual plateau — so an over-pulled wing loses most (not all) of its lift
 * and recovers once the nose is lowered / speed returns.
 */
export function liftCoeff(alphaDeg: number): number {
  const sign = alphaDeg < 0 ? -1 : 1;
  const a = Math.abs(alphaDeg);
  const peak = AERO.CL_ALPHA * (AERO.ALPHA_STALL * DEG);
  if (a <= AERO.ALPHA_STALL) {
    return AERO.CL_ALPHA * (alphaDeg * DEG);
  }
  const over = a - AERO.ALPHA_STALL;
  const falloff = Math.max(AERO.CL_PLATEAU, 1 - over / AERO.POST_STALL_BAND);
  return sign * peak * falloff;
}

/** Drag coefficient: parasitic + induced (∝ CL²). */
export function dragCoeff(cl: number): number {
  return AERO.CD0 + AERO.K_INDUCED * cl * cl;
}

/** Peak (max) lift coefficient, at the stall angle. */
export function clMax(): number {
  return AERO.CL_ALPHA * (AERO.ALPHA_STALL * DEG);
}

/** The level-flight stall speed (u/s): the slowest speed that can still hold
 *  weight at CL_max. Below it, level flight is impossible. */
export function stallSpeed(): number {
  return Math.sqrt(AERO.G / (AERO.QS * clMax()));
}

/** Angle of attack (deg) needed for level flight at speed V — i.e. the trim
 *  attitude when the flight path is level. Clamped at the stall angle. */
export function trimPitchDeg(V: number): number {
  const clNeeded = Math.min(AERO.G / (AERO.QS * V * V), clMax());
  const alphaRad = clNeeded / AERO.CL_ALPHA;
  return alphaRad / DEG;
}

/** Throttle (0..1) that holds level flight at speed V (thrust = drag at trim). */
export function trimThrottle(V: number): number {
  const clNeeded = Math.min(AERO.G / (AERO.QS * V * V), clMax());
  const cd = dragCoeff(clNeeded);
  const drag = AERO.QS * V * V * cd;
  return Math.max(0, Math.min(1, drag / AERO.THRUST_MAX));
}
