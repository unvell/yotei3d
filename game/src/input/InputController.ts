import type { Controls, ControlKey } from './controls';

// keyboard:  ←/→ and A/D = yaw (identical effect),
//            ↑/↓ = pitch (↑ push down / ↓ pull up),  W/S = throttle,  R = reset
const KEYMAP: Record<string, ControlKey> = {
  ArrowLeft: 'left',
  ArrowRight: 'right',
  ArrowUp: 'up',
  ArrowDown: 'down',
  KeyA: 'left',
  KeyD: 'right',
  KeyW: 'thrUp',
  KeyS: 'thrDown',
};

/** Maps keyboard events onto the shared Controls struct. */
export class InputController {
  private readonly _onKeyDown: (e: KeyboardEvent) => void;
  private readonly _onKeyUp: (e: KeyboardEvent) => void;

  constructor(private readonly controls: Controls) {
    this._onKeyDown = (e) => {
      if (e.code === 'KeyR') {
        this.controls.requestReset();
        return;
      }
      const k = KEYMAP[e.code];
      if (!k) return;
      this.controls.set(k, true);
      e.preventDefault();
    };
    this._onKeyUp = (e) => {
      const k = KEYMAP[e.code];
      if (!k) return;
      this.controls.set(k, false);
      e.preventDefault();
    };
  }

  attach(): void {
    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
  }

  detach(): void {
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);
  }
}
