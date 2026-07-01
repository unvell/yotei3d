// Game audio (Web Audio API). Self-contained — no engine/DOM coupling beyond the
// AudioContext. Preloads a handful of clips at start; because browsers block audio
// until a user gesture, playback is armed by `unlock()` (called on the first
// key/pointer) which resumes the context, starts the looping engine and fires the
// "autopilot disconnected — you have control" start cue ~3 s later.
//
// Per-frame `update()` drives:
//   • the jet turbine loop  — volume + pitch from throttle/speed,
//   • a GPWS-style "PULL UP" — on stall or an imminent hard impact, and
//   • radar-altitude callouts — "fifty … forty … thirty … twenty … ten" as the
//     height above the deck passes each mark on the way down. The five words live
//     in one mp3; we split it by silence at load and play each segment by offset.

import type { FlightModel } from '../aircraft/FlightModel';

interface Seg {
  offset: number;
  dur: number;
}

const AUDIO = {
  ENGINE: '/audio/jet-turbine.mp3',
  AUTOPILOT: '/audio/autopilot-disconnect.mp3',
  PULLUP: '/audio/pull-up.mp3',
  ALT: '/audio/alt-callouts.mp3',
  THUMP: '/audio/deck-thump.mp3',
};

// Deck-roll rumble: replay the thump every this many seconds while rolling out.
const DECK_THUMP_INTERVAL = 0.1;

// Radar-altitude callout marks (height above the deck, world units ≈ metres).
const ALT_MARKS = [50, 40, 30, 20, 10];

export class AudioManager {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private buffers: Record<string, AudioBuffer> = {};
  private altSegs: Seg[] = [];

  private engineSrc: AudioBufferSourceNode | null = null;
  private engineGain: GainNode | null = null;

  private unlocked = false;
  private started = false;

  // trigger state
  private pullUpCooldown = 0; // s remaining before "pull up" can fire again
  private altIdx = 0; // next ALT_MARKS index to announce (advances downward)
  private deckRollAccum = 0; // s accumulated toward the next deck-roll thump
  private startCueTimer: ReturnType<typeof setTimeout> | null = null;

  /** Preload + decode all clips. Safe to call before any user gesture. */
  async init(): Promise<void> {
    try {
      const Ctx = window.AudioContext || (window as any).webkitAudioContext;
      if (!Ctx) return;
      this.ctx = new Ctx();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.75;
      this.master.connect(this.ctx.destination);

      const load = async (key: string, url: string) => {
        const res = await fetch(url);
        const arr = await res.arrayBuffer();
        this.buffers[key] = await this.ctx!.decodeAudioData(arr);
      };
      await Promise.all([
        load('engine', AUDIO.ENGINE),
        load('autopilot', AUDIO.AUTOPILOT),
        load('pullup', AUDIO.PULLUP),
        load('alt', AUDIO.ALT),
        load('thump', AUDIO.THUMP),
      ]);
      if (this.buffers.alt) this.altSegs = splitBySilence(this.buffers.alt);
    } catch (e) {
      console.warn('audio init failed (continuing muted):', e);
    }
  }

  /** Arm playback on the first user gesture: resume, start engine, cue "you have control". */
  unlock(): void {
    if (this.unlocked || !this.ctx) return;
    this.unlocked = true;
    this.ctx.resume?.();
    this._startEngine();
    this._armStartCue(3000);
  }

  private _armStartCue(delayMs: number): void {
    if (!this.unlocked) return;
    if (this.startCueTimer) clearTimeout(this.startCueTimer);
    this.startCueTimer = setTimeout(() => this._playOneShot('autopilot', 0.9), delayMs);
  }

  private _startEngine(): void {
    if (this.started || !this.ctx || !this.buffers.engine || !this.master) return;
    this.started = true;
    const src = this.ctx.createBufferSource();
    src.buffer = this.buffers.engine;
    src.loop = true;
    const g = this.ctx.createGain();
    g.gain.value = 0.0;
    src.connect(g);
    g.connect(this.master);
    src.start();
    this.engineSrc = src;
    this.engineGain = g;
  }

  private _playOneShot(key: string, vol: number, offset = 0, dur?: number): void {
    if (!this.ctx || !this.master || !this.buffers[key] || this.ctx.state !== 'running') return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.buffers[key];
    const g = this.ctx.createGain();
    g.gain.value = vol;
    src.connect(g);
    g.connect(this.master);
    if (dur != null) src.start(0, offset, dur);
    else src.start(0, offset);
  }

  /** Advance the audio from the current flight state. `dt` in seconds. */
  update(dt: number, f: FlightModel, deckTopY: number): void {
    if (!this.unlocked || !this.ctx) return;
    if (this.pullUpCooldown > 0) this.pullUpCooldown -= dt;

    const flying = f.phase === 'flying';

    // --- engine loop: volume + pitch track throttle & speed ---
    if (this.engineGain && this.engineSrc) {
      const thrust = Math.max(0, f.throttle); // 0..1 (negative = airbrake, no thrust sound)
      let targetGain: number;
      let targetRate: number;
      if (f.phase === 'crashed') {
        targetGain = 0;
        targetRate = 0.7;
      } else {
        // always-on idle hum while flying/rolling, swelling with thrust + speed
        targetGain = 0.16 + 0.5 * thrust;
        targetRate = 0.88 + 0.42 * thrust + Math.min(0.15, f.speed / 1600);
      }
      // smooth toward the target so it spools rather than jumps
      const k = Math.min(1, 3 * dt);
      this.engineGain.gain.value += (targetGain - this.engineGain.gain.value) * k;
      this.engineSrc.playbackRate.value += (targetRate - this.engineSrc.playbackRate.value) * k;
    }

    // --- deck-roll rumble: a thump every 0.1 s while rolling out after a trap,
    //     fading with speed so it eases off as the jet decelerates to a stop. ---
    if (f.phase === 'arrested' && f.speed > 2) {
      this.deckRollAccum += dt;
      while (this.deckRollAccum >= DECK_THUMP_INTERVAL) {
        this.deckRollAccum -= DECK_THUMP_INTERVAL;
        const vol = 0.25 + 0.45 * Math.min(1, f.speed / 60);
        this._playOneShot('thump', vol);
      }
    } else {
      this.deckRollAccum = 0;
    }

    if (!flying) return; // warnings + callouts only while airborne

    const heightAboveDeck = f.pos.y - deckTopY;
    const heightAboveSea = f.pos.y; // sea at y≈0
    const distToShip = Math.hypot(f.pos.x, f.pos.z);

    // --- GPWS "PULL UP": on stall, or an imminent hard impact ---
    if (this.pullUpCooldown <= 0) {
      const impactSurf = Math.min(heightAboveSea, heightAboveDeck); // whichever is closer
      const tti = f.sinkRate > 0.1 ? impactSurf / f.sinkRate : Infinity; // time to impact (s)
      const imminent = f.sinkRate > 12 && tti < 1.3 && impactSurf > 1.5;
      if (f.stalled || imminent) {
        this._playOneShot('pullup', 0.95);
        this.pullUpCooldown = 3.5;
      }
    }

    // --- radar-altitude callouts (only on a descending approach near the ship) ---
    // re-arm from the top once we climb back above the first mark
    if (heightAboveDeck > ALT_MARKS[0] + 5) this.altIdx = 0;
    if (
      this.altSegs.length === ALT_MARKS.length &&
      f.sinkRate > 0.5 &&
      distToShip < 900 &&
      this.altIdx < ALT_MARKS.length &&
      heightAboveDeck <= ALT_MARKS[this.altIdx] &&
      heightAboveDeck > 1
    ) {
      const seg = this.altSegs[this.altIdx];
      this._playOneShot('alt', 1.0, seg.offset, seg.dur);
      this.altIdx++;
    }
  }

  /** Player pressed reset: re-arm callouts and re-cue "you have control". */
  onReset(): void {
    this.altIdx = 0;
    this.pullUpCooldown = 0;
    if (this.unlocked) this._armStartCue(2500);
  }

  dispose(): void {
    if (this.startCueTimer) clearTimeout(this.startCueTimer);
    try {
      this.engineSrc?.stop();
    } catch {
      /* already stopped */
    }
    this.engineSrc = null;
    this.ctx?.close?.();
    this.ctx = null;
  }
}

/**
 * Split a multi-word clip into its non-silent segments (offset + duration) by a
 * simple RMS-envelope threshold, merging pieces separated by tiny gaps so a single
 * word isn't cut in half. Used to slice the "fifty … ten" callouts.
 */
function splitBySilence(buf: AudioBuffer): Seg[] {
  const data = buf.getChannelData(0);
  const sr = buf.sampleRate;
  const win = Math.max(1, Math.floor(sr * 0.02)); // 20 ms windows
  const rms: number[] = [];
  for (let i = 0; i < data.length; i += win) {
    let s = 0;
    let n = 0;
    for (let j = i; j < i + win && j < data.length; j++) {
      s += data[j] * data[j];
      n++;
    }
    rms.push(Math.sqrt(s / n));
  }
  let peak = 0;
  for (const r of rms) if (r > peak) peak = r;
  const thr = peak * 0.06;

  const raw: Seg[] = [];
  let start = -1;
  for (let k = 0; k <= rms.length; k++) {
    const loud = k < rms.length && rms[k] > thr;
    if (loud && start < 0) start = k;
    else if (!loud && start >= 0) {
      raw.push({ offset: start * 0.02, dur: (k - start) * 0.02 });
      start = -1;
    }
  }
  // merge segments separated by < 120 ms, and drop specks < 80 ms
  const merged: Seg[] = [];
  for (const seg of raw) {
    const last = merged[merged.length - 1];
    if (last && seg.offset - (last.offset + last.dur) < 0.12) {
      last.dur = seg.offset + seg.dur - last.offset;
    } else {
      merged.push({ ...seg });
    }
  }
  // pad each segment a touch so onsets/tails aren't clipped
  return merged
    .filter((s) => s.dur >= 0.08)
    .map((s) => ({ offset: Math.max(0, s.offset - 0.03), dur: s.dur + 0.08 }));
}
