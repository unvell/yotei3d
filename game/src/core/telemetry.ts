// The data contract between the simulation (Game/FlightModel) and the DOM HUD.
// The Game writes these fields each frame; the Vue HUD reads them reactively.

export interface Telemetry {
  speed: number; // raw airspeed (u/s) — drives the bar fill
  speedKmh: number; // displayed airspeed (km/h)
  alt: number; // altitude (world units)
  throttlePct: number; // 0..100
  stallT: number; // 0 (clean) → 1 (departed)
  stalled: boolean;
}

export function createTelemetry(): Telemetry {
  return { speed: 0, speedKmh: 0, alt: 0, throttlePct: 0, stallT: 0, stalled: false };
}
