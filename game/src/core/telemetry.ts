// The data contract between the simulation (Game/FlightModel) and the DOM HUD.
// The Game writes these fields each frame; the Vue HUD reads them reactively.

import type { FlightPhase } from '../aircraft/FlightModel';

export interface Telemetry {
  speed: number; // raw airspeed (u/s) — drives the bar fill
  speedKmh: number; // displayed airspeed (km/h)
  alt: number; // altitude (world units)
  sinkRate: number; // vertical speed, + = descending (u/s)
  throttlePct: number; // 0..100
  aoa: number; // angle of attack (deg) — wing bite
  stallT: number; // 0 (clean) → 1 (at/over stall angle)
  stalled: boolean;
  phase: FlightPhase; // flying | arrested | crashed
  landingMsg: string; // outcome banner text ('' while flying)
}

export function createTelemetry(): Telemetry {
  return {
    speed: 0,
    speedKmh: 0,
    alt: 0,
    sinkRate: 0,
    throttlePct: 0,
    aoa: 0,
    stallT: 0,
    stalled: false,
    phase: 'flying',
    landingMsg: '',
  };
}
