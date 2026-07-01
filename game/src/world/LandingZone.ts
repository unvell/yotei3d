// Deck touchdown judge (P2.1 / P3) — pure geometry + landing-envelope check, no
// engine or DOM. The Game builds one from the fitted carrier and calls
// `evaluate()` each frame while the jet is flying; the verdict drives the
// FlightModel's phase.
//
// Frame of reference (see Carrier.ts / LANDING-SPECS §5): the carrier holder sits
// at the origin, deck centred on X=0 / Z=0, long axis along Z. The bow is at −Z,
// the stern at +Z, so the jet approaches from +Z (behind) heading toward −Z and
// touches down in the aft landing area. The flight deck surface is `deckTopY`.
//
// Two zones:
//   • the deck box — the whole ship footprint, used to tell a deck touchdown from
//     a sea ditch, and
//   • the wire zone — the actual arresting-wire landing area on the angled deck
//     (from the Blender `landing-runway` + `landing-wire-origin` markers). A clean
//     trap must land in the wire zone; a deck touchdown outside it "missed the
//     wires" (a bolter). If the markers are absent the wire zone is null and the
//     judge falls back to trapping anywhere on the deck box.

import type { FlightModel } from '../aircraft/FlightModel';
import type { CarrierFit } from './Carrier';
import { AERO } from '../aircraft/tunables';

/** The deck as a simple axis-aligned box on the water. */
export interface DeckBox {
  centerX: number;
  centerZ: number;
  topY: number; // flight-deck surface height (world units)
  halfLenZ: number; // half the deck length along Z
  halfWidX: number; // half the deck width along X
}

/** The arresting-wire landing area — an oriented rectangle on the angled deck. */
export interface WireZone {
  cx: number;
  cz: number; // centre (world, at the wires)
  alongX: number;
  alongZ: number; // unit vector along the deck
  acrossX: number;
  acrossZ: number; // unit vector across the deck
  halfLen: number; // trap band half-length along the deck
  halfWid: number; // half-width across the deck
}

/** One frame's verdict for a flying aircraft. */
export type LandingVerdict =
  | { kind: 'none' }
  | { kind: 'trap'; deckY: number; grade: string; sinkRate: number; speedKmh: number }
  | { kind: 'crash'; reason: string };

// Landing envelope, tuned for the F-2 approach (≈ 280 km/h / 78 u/s @ ~11° AoA).
// Generous for a game, but still rewards a controlled, shallow, wings-level pass.
export const LANDING = {
  CONTACT_EPS: 1.5, // u — "touch" band at/below the deck surface
  MAX_SINK: 12, // u/s — hardest survivable touchdown sink rate
  MAX_TRAP_SPEED: 115, // u/s (~415 km/h) — faster than this and it won't settle
  MAX_ROLL: 8, // deg — wings must be near level
  MAX_TRAP_AOA: 18, // deg — must not be stalled / mushing on
  // deck-box margins (fallback footprint from the full hull bounds)
  EDGE_MARGIN_X: 5, // u off each side
  AFT_CLEAR: 10, // u off the stern round-down (+Z)
  FWD_CLEAR: 25, // u off the bow (−Z)
  // wire zone (from the Blender markers)
  WIRE_BAND: 34, // u — half the along-deck length of the trap zone around the wires
  WIRE_WIDTH_MARGIN: 4, // u — extra half-width beyond the runway strip
} as const;

const SEA_LEVEL = AERO.MIN_ALT;

export class LandingJudge {
  constructor(
    readonly deck: DeckBox,
    readonly wire: WireZone | null = null,
  ) {}

  /** Build the deck box from the fitted carrier (holder centred at the origin). */
  static fromCarrier(fit: CarrierFit, deckTopY: number, wire: WireZone | null = null): LandingJudge {
    return new LandingJudge(
      {
        centerX: 0,
        centerZ: 0,
        topY: deckTopY,
        halfLenZ: fit.worldSize.z / 2,
        halfWidX: fit.worldSize.x / 2,
      },
      wire,
    );
  }

  /** Is (x,z) over the ship's deck footprint (minus edge margins)? */
  onDeck(x: number, z: number): boolean {
    const d = this.deck;
    const dx = Math.abs(x - d.centerX);
    const dz = z - d.centerZ;
    return (
      dx <= d.halfWidX - LANDING.EDGE_MARGIN_X &&
      dz <= d.halfLenZ - LANDING.AFT_CLEAR &&
      dz >= -(d.halfLenZ - LANDING.FWD_CLEAR)
    );
  }

  /** Is (x,z) in the arresting-wire landing zone (where a clean trap happens)? */
  inWireZone(x: number, z: number): boolean {
    const w = this.wire;
    if (!w) return this.onDeck(x, z); // no markers → trap anywhere on the deck
    const rx = x - w.cx;
    const rz = z - w.cz;
    const along = rx * w.alongX + rz * w.alongZ;
    const across = rx * w.acrossX + rz * w.acrossZ;
    return Math.abs(along) <= w.halfLen && Math.abs(across) <= w.halfWid;
  }

  /** Judge one frame. Call ONLY while the jet is still flying. */
  evaluate(f: FlightModel): LandingVerdict {
    const { x, y, z } = f.pos;

    // Deck touchdown: settling onto the deck surface.
    if (y <= this.deck.topY + LANDING.CONTACT_EPS && this.onDeck(x, z)) {
      // Landed on the deck but not in the wire zone → floated past / missed them.
      if (!this.inWireZone(x, z)) {
        return { kind: 'crash', reason: 'missed the wires — land in the touchdown zone' };
      }
      const sink = f.sinkRate; // + = descending
      const rollOk = Math.abs(f.roll) <= LANDING.MAX_ROLL;
      const sinkOk = sink <= LANDING.MAX_SINK;
      const speedOk = f.speed <= LANDING.MAX_TRAP_SPEED;
      const aoaOk = Math.abs(f.alpha) <= LANDING.MAX_TRAP_AOA && !f.stalled;

      if (sinkOk && speedOk && rollOk && aoaOk) {
        return {
          kind: 'trap',
          deckY: this.deck.topY,
          grade: grade(sink),
          sinkRate: sink,
          speedKmh: f.speed * 3.6,
        };
      }
      const why: string[] = [];
      if (!sinkOk) why.push('sink rate too high');
      if (!speedOk) why.push('too fast');
      if (!rollOk) why.push('wings not level');
      if (!aoaOk) why.push('stalled');
      return { kind: 'crash', reason: why.join(' · ') };
    }

    // Hit the sea clear of the deck → ditched (missed the ship).
    if (!this.onDeck(x, z) && y <= SEA_LEVEL) {
      return { kind: 'crash', reason: 'ditched — missed the deck' };
    }
    return { kind: 'none' };
  }
}

/** Landing grade by how softly it was put down. */
function grade(sink: number): string {
  if (sink < 4) return 'PERFECT';
  if (sink < 8) return 'GOOD';
  return 'FIRM';
}
