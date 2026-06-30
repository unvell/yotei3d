// Flight model tunables for the F-2.
//
// As of the physics-based rewrite this is an *angle-of-attack point-mass* model
// (longitudinal / vertical-plane). The numbers below are aerodynamic coefficients
// (mass is folded to 1, so forces are accelerations in engine units/s²). Trim
// speed, stall speed and top speed are NOT set here — they *emerge* from these
// coefficients (see aero.ts). Tune feel by changing the coefficients; the helper
// functions in aero.ts report the resulting trim/stall numbers.

export const AERO = {
  G: 9.8, // gravity (accel, u/s²) — 1 unit ≈ 1 m, F-2 ≈ 10 u

  // Lift / drag share a dynamic-pressure factor q = QS · V². QS lumps ½·ρ·S / m.
  // Tuned to real F-2 / F-16-class speeds (the HUD treats 1 u/s = 1 m/s, ×3.6 km/h):
  //   stall ≈ 240 km/h, approach ≈ 280 km/h @ ~12° AoA, top ≈ 1190 km/h,
  //   level trim around START.speed (110 u/s ≈ 396 km/h) at a few degrees AoA.
  QS: 0.00168,

  CL_ALPHA: 5.0, // lift-curve slope (CL per radian of AoA)
  ALPHA_STALL: 15, // deg — lift peaks at this AoA, then drops (stall); < AOA_LIMIT
  POST_STALL_BAND: 15, // deg — lift falls off over this band past the stall angle
  CL_PLATEAU: 0.4, // post-stall residual lift fraction (keeps it recoverable, not a tumble)

  CD0: 0.02, // parasitic drag coefficient
  K_INDUCED: 0.08, // induced-drag factor in CD = CD0 + k·CL²

  THRUST_MAX: 3.7, // full-throttle thrust (accel, u/s²) — high T/W, sets top ≈ 1190 km/h
  THR_RATE: 0.45, // throttle change per second (0..1)

  PITCH_RATE: 18, // deg/s — elevator authority (nose rotation rate while held)
  PITCH_MIN: -60, // deg — clamp the persistent pitch attitude
  PITCH_MAX: 60,

  // AoA limiter (fly-by-wire, F-16/F-2 style): the wing won't follow the elevator
  // far past the stall, so you can't peg the nose into a deep-stall mush. Nose-up
  // (and nose-down) authority fades to 0 as |AoA| approaches the limit. This is an
  // envelope limit, NOT an auto-return — release and the attitude still persists.
  AOA_LIMIT: 24, // deg — max usable angle of attack (F-16-class limiter)
  AOA_LIMIT_BAND: 6, // deg — authority fades over this band up to the limit

  YAW_RATE: 5, // heading change (deg/s) from yaw input (turn kept simple/coordinated)
  MAX_BANK: 10, // visual bank at full yaw input (deg)

  V_MIN: 8, // speed floor (keeps the γ̇ = .../V term finite)
  MIN_ALT: 3, // sea-surface guard
  STALL_WARN_MARGIN: 3, // deg before the stall angle the HUD starts cautioning
} as const;

// HUD airspeed-bar full-scale (u/s). Display-only; the bar shows energy/speed
// while the colour now comes from AoA (see aero.stallSpeed / Hud.vue). Sized for
// the approach→cruise band (~0..790 km/h); supersonic dashes just peg the bar.
export const HUD_SPEED_SCALE = 220;

// Initial / reset pose. Pitch attitude + throttle are derived at spawn from the
// trim helpers (aero.ts) so the jet always starts trimmed for START.speed,
// regardless of how the coefficients above are tuned. Press R to return here.
export const START = {
  x: 0,
  y: 300,
  z: 3550,
  heading: 0,
  speed: 110,
} as const;
