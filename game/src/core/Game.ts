import { Renderer } from '@';
import type { Scene } from '@';
import { Environment } from '../world/Environment';
import { OceanWorld } from '../world/OceanWorld';
import { Carrier } from '../world/Carrier';
import { LandingJudge, LANDING } from '../world/LandingZone';
import { Aircraft } from '../aircraft/Aircraft';
import { FlightModel } from '../aircraft/FlightModel';
import { FlightChaseController } from '../camera/FlightChaseController';
import { InputController } from '../input/InputController';
import { AudioManager } from '../audio/AudioManager';
import type { Controls } from '../input/controls';
import type { Telemetry } from './telemetry';

const RENDERER_OPTIONS = {
  backColor: [0.7, 0.82, 0.92, 1],
  enablePostprocess: true,
  enableAntialias: true,
  enableShadow: false,
  perspective: { method: 'persp', angle: 55, near: 0.5, far: 8000 },
  bloomEffect: { enabled: true, threshold: 0.6, gamma: 1.4, intensity: 0.9 },
  renderingImage: { gamma: 1.1, resolutionRatio: 0.5 },
};

/**
 * Top-level orchestrator for the Carrier Landing game. Owns the renderer, the
 * scene, and every subsystem (environment, ocean, carrier, aircraft, flight
 * model, chase camera, input), and runs the per-frame loop that ties the
 * simulation to the view and the HUD. This is the class that replaces
 * landing-p2.html's inline `window.onload` body.
 */
export class Game {
  readonly renderer: Renderer;
  readonly scene: Scene;

  readonly environment: Environment;
  readonly ocean: OceanWorld;
  readonly carrier: Carrier;
  readonly aircraft: Aircraft;
  readonly flight = new FlightModel();
  readonly chaseCam: FlightChaseController;
  private readonly input: InputController;
  private readonly audio = new AudioManager();

  // Touchdown judge — built once the carrier fit is known (async load).
  private judge: LandingJudge | null = null;
  private landingMsg = '';

  private _lastT = 0;
  private _disposed = false;

  constructor(
    private readonly container: HTMLElement,
    private readonly controls: Controls,
    private readonly telemetry: Telemetry,
  ) {
    // The engine locates its canvas by container id; ensure ours has it.
    if (!container.id) container.id = 'canvas-container';

    this.renderer = new Renderer({ ...RENDERER_OPTIONS, containerId: container.id });
    this.scene = this.renderer.createScene();

    // --- world ---
    this.environment = new Environment(this.renderer, this.scene);
    this.environment.setup();

    this.ocean = new OceanWorld(this.scene);

    this.carrier = new Carrier(this.scene);
    this.carrier
      .load()
      .then((fit) => {
        // Deck box from the fit; the wire zone from the Blender markers (if present).
        const c = this.carrier;
        const wire =
          c.wireOrigin && c.deckAlong && c.deckAcross
            ? {
                cx: c.wireOrigin.x,
                cz: c.wireOrigin.z,
                alongX: c.deckAlong.x,
                alongZ: c.deckAlong.z,
                acrossX: c.deckAcross.x,
                acrossZ: c.deckAcross.z,
                halfLen: LANDING.WIRE_BAND,
                halfWid: c.runwayHalfWidth + LANDING.WIRE_WIDTH_MARGIN,
              }
            : null;
        this.judge = LandingJudge.fromCarrier(fit, c.deckTopY, wire);
      })
      .catch((e) => console.error(e));

    // lens flare needs the carrier hull as an occluder
    this.environment.addSunFlare([this.carrier.holder]);

    // --- aircraft ---
    this.aircraft = new Aircraft(this.scene);
    this.aircraft.load().catch((e) => console.error(e));

    // --- chase camera ---
    this.scene.mainCamera.fieldOfView = 55;
    this.chaseCam = new FlightChaseController({
      getState: () => this.flight.getCameraState(),
      distance: 12,
      restEl: 15,
      minDistance: 18,
      maxDistance: 600,
    });
    this.scene.mainCamera.controller = this.chaseCam;

    // --- input ---
    this.input = new InputController(this.controls);

    // --- audio (preload now; playback is armed by the first user gesture) ---
    this.audio.init();

    // expose a debug handle, like landing-p2 did on window
    (window as any).game = this;
  }

  private _unlockAudio = (): void => {
    this.audio.unlock();
    window.removeEventListener('keydown', this._unlockAudio);
    window.removeEventListener('pointerdown', this._unlockAudio);
  };

  start(): void {
    this.input.attach();
    // browsers block audio until a user gesture — arm it on the first key/tap
    window.addEventListener('keydown', this._unlockAudio);
    window.addEventListener('pointerdown', this._unlockAudio);
    this.scene.on('frame', () => this._frame());
    this.scene.animation = true;
    this.scene.show();
  }

  private _frame(): void {
    if (this._disposed) return;

    const now = performance.now();
    const dt = this._lastT ? Math.min((now - this._lastT) / 1000, 0.05) : 0.016;
    this._lastT = now;

    this.ocean.update();

    if (this.controls.consumeReset()) {
      this.flight.reset();
      this.landingMsg = '';
      this.audio.onReset();
    }
    this.flight.update(dt, this.controls);

    // --- deck touchdown / crash judging (only while still flying) ---
    if (this.judge && this.flight.phase === 'flying') {
      const v = this.judge.evaluate(this.flight);
      if (v.kind === 'trap') {
        // halt the roll a little short of the bow so it never slides off the front
        this.flight.arrest(v.deckY, -(this.judge.deck.halfLenZ - 6));
        this.landingMsg = `LANDED — ${v.grade}  (${v.sinkRate.toFixed(1)} u/s, ${v.speedKmh.toFixed(0)} km/h)`;
      } else if (v.kind === 'crash') {
        this.flight.crash();
        this.landingMsg = `CRASH — ${v.reason}`;
      }
    }

    this.aircraft.applyState(this.flight);

    // --- publish telemetry to the HUD ---
    this.telemetry.speed = this.flight.speed;
    this.telemetry.speedKmh = this.flight.speed * 3.6;
    this.telemetry.alt = this.flight.pos.y;
    this.telemetry.sinkRate = this.flight.sinkRate;
    this.telemetry.throttlePct = this.flight.throttle * 100;
    this.telemetry.aoa = this.flight.alpha;
    this.telemetry.stallT = this.flight.stallT;
    this.telemetry.stalled = this.flight.stalled;
    this.telemetry.phase = this.flight.phase;
    this.telemetry.landingMsg = this.landingMsg;

    // --- audio: engine loop + stall/GPWS warnings + altitude callouts ---
    this.audio.update(dt, this.flight, this.carrier.deckTopY);

    // (the chase camera positions itself from the renderer's controller tick.)
  }

  dispose(): void {
    this._disposed = true;
    this.input.detach();
    this.audio.dispose();
    window.removeEventListener('keydown', this._unlockAudio);
    window.removeEventListener('pointerdown', this._unlockAudio);
    try {
      this.scene.mainCamera.controller = null;
    } catch {
      /* ignore */
    }
    // remove the engine-created canvases so HMR / remounts don't stack them up.
    while (this.container.firstChild) this.container.removeChild(this.container.firstChild);
  }
}
