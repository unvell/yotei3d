// Flight model tunables for the F-2 — the single source of truth, lifted out of
// landing-p2.html's inline constants. The HUD (airspeed bar marker) and the
// physics both read these, so changing the feel happens in one place.

export const FLIGHT = {
  MAX_SPEED: 200, // full-throttle airspeed (u/s)
  TRIM_SPEED: 100, // level-flight speed: at/above it, pitch-0 holds altitude;
  //                   below it the wing makes too little lift, so the jet sinks.
  STALL_SPEED: 42, // wing departs below this (soft — a ramp, not a switch)
  STALL_MARGIN: 12, // speed band over which the stall eases in (u/s)
  SINK_MAX: 24, // terminal gravity sink when the wing makes no lift (u/s)
  THR_RATE: 0.45, // throttle change per second (0..1)
  ACCEL: 0.6, // how quickly speed chases the throttle setting
  YAW_RATE: 5, // heading change (deg/s) from yaw input (←/→ and A/D)
  MAX_PITCH: 15, // climb/dive attitude at full pitch input (deg)
  PITCH_EASE: 2.2, // how quickly pitch eases to its target
  MAX_BANK: 10, // roll angle at full yaw input (deg, visual bank)
  STALL_DROP: 14, // nose-down attitude a full stall forces (deg)
  MIN_ALT: 3, // never sink below this (sea surface guard)
} as const;

// Initial / reset pose. The jet spawns astern and high (≈3.5 km out, 300 m up),
// pointed back toward the carrier (heading 0 = world −Z, the way the bow points),
// already at a sensible cruise. Press R to return here.
export const START = {
  x: 0,
  y: 300,
  z: 3550,
  heading: 0,
  speed: 88,
  throttle: 0.62,
} as const;
