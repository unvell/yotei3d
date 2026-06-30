// Shared control state — the one struct both the keyboard (InputController) and
// the on-screen pads (VirtualPads.vue) write to, and the flight model reads.
//
// up/down  = pitch   (up = push-down/descend, down = pull-up/climb — matches p2)
// left/right = yaw
// thrUp/thrDown = throttle
// reset is momentary: the game loop consumes it once per press.

export type ControlKey = 'up' | 'down' | 'left' | 'right' | 'thrUp' | 'thrDown';

export class Controls {
  up = false;
  down = false;
  left = false;
  right = false;
  thrUp = false;
  thrDown = false;

  private _resetRequested = false;

  set(key: ControlKey, value: boolean): void {
    this[key] = value;
  }

  /** Request a one-shot flight reset (e.g. the R key or a "RESET" button). */
  requestReset(): void {
    this._resetRequested = true;
  }

  /** Read-and-clear the reset request. Returns true at most once per press. */
  consumeReset(): boolean {
    const r = this._resetRequested;
    this._resetRequested = false;
    return r;
  }
}
