import { PointLight, SceneObject, Shapes, Texture } from '@';
import type { Scene } from '@';
import type { FlightModel } from './FlightModel';

const F2_OBJ_URL = '/models/F2/F2.obj';
const F2_SKIN_URL = '/models/F2/skin1.jpg';

/**
 * The F-2 jet — the *view* half of the aircraft (the physics live in
 * FlightModel). Loads the OBJ, paints it, wires nav-lights / canopy / HUD
 * materials like f2-flight.html, and builds a throttle-reactive afterburner.
 * Each frame the game calls applyState(flight) to drive the model from the
 * simulation. Ported from landing-p2.html.
 */
export class Aircraft {
  jet: SceneObject | null = null;
  private burner: SceneObject | null = null;
  private burnerLight: PointLight | null = null;

  constructor(private readonly scene: Scene) {}

  get ready(): boolean {
    return this.jet !== null;
  }

  load(): Promise<SceneObject> {
    return new Promise((resolve, reject) => {
      this.scene.createObjectFromObjFormat(F2_OBJ_URL, (obj: any) => {
        if (!obj) {
          console.error('failed to load F2.obj');
          reject(new Error('F2 load failed'));
          return;
        }
        this.jet = obj;
        this.scene.add(obj);

        // Rotate YAW → PITCH → ROLL so pitch happens about the jet's own lateral
        // axis and stays consistent at every heading (default XYZ flips sign).
        obj._angleOrder = 'YXZ';

        this._applySkin(obj);
        this._buildAfterburner(obj);

        this.scene.requireUpdateFrame();
        resolve(obj);
      }, {});
    });
  }

  private _applySkin(obj: any): void {
    const img = new Image();
    img.onload = () => {
      const skin = new Texture(img);
      skin.flipY = true;
      obj.eachChild((c: any) => {
        if (!c.mat) return;
        if (c.name === 'body') {
          c.mat.tex = skin;
          c.mat.metallic = 0.1;
          c.mat.roughness = 0.5;
        } else if (c.name === 'light-side-red') {
          c.mat.color = [1.0, 0.05, 0.0];
          c.mat.emission = 2.0;
        } else if (c.name === 'light-side-green') {
          c.mat.color = [0.0, 1.0, 0.1];
          c.mat.emission = 2.0;
        } else if (c.name === 'light-white') {
          c.mat.color = [1.0, 1.0, 1.0];
          c.mat.emission = 3.0;
        } else if (c.name === 'cocpit-glass') {
          c.mat.color = [0.35, 0.44, 0.53];
          c.mat.metallic = 0.3;
          c.mat.roughness = 0.3;
          c.opacity = 0.4;
        } else if (c.name === 'hud-display') {
          c.mat.color = [0.15, 1.0, 0.35];
          c.mat.emission = 1.0;
        } else if (c.name === 'metal') {
          c.mat.color = [0.3, 0.3, 0.3];
          c.mat.metallic = 0.5;
          c.mat.roughness = 0.7;
        }
      });
      this.scene.requireUpdateFrame();
    };
    img.src = F2_SKIN_URL;
  }

  private _buildAfterburner(obj: any): void {
    // a short additive plume out the nozzle (local −Z); length + glow scale with
    // throttle (driven in applyState).
    const burner = new SceneObject();
    burner.location.set(0, -0.1, -4.6);
    obj.add(burner);

    const blob = (z: number, rad: number, color: number[], opacity: number) => {
      const p = new Shapes.Sphere(12, 18);
      p.scale.set(rad, rad, rad * 1.8);
      p.location.set(0, -0.55, z);
      p.mat.color = color;
      p.mat.emission = 1.0;
      p.mat.additive = true;
      p.mat.castLight = false;
      p.opacity = opacity;
      burner.add(p);
    };
    blob(0, 0.27, [1.0, 0.6, 0.25], 0.5);
    this.burner = burner;

    const burnerLight = new PointLight();
    burnerLight.location.set(0, -0.1, -4.2);
    burnerLight.mat.color = [1.0, 0.6, 0.3];
    burnerLight.mat.emission = 4.0;
    obj.add(burnerLight);
    this.burnerLight = burnerLight;
  }

  /** Drive the model from the simulation. No-op until the OBJ has loaded. */
  applyState(flight: FlightModel): void {
    const jet = this.jet;
    if (!jet) return;

    jet.location.set(flight.pos.x, flight.pos.y, flight.pos.z);
    // YXZ order: yaw about world Y, then pitch about body lateral, then roll.
    // 180° base yaw points the nose down −Z at heading 0.
    jet.angle.set(-flight.pitch, 180 + flight.heading, flight.roll);

    const now = performance.now();
    if (this.burner) {
      const len = 0.5 + flight.throttle * 1.1;
      this.burner.scale.set(1, 1, len * (1 + Math.sin(now * 0.04) * 0.06));
      this.burner.visible = flight.throttle > 0.05;
    }
    if (this.burnerLight) this.burnerLight.mat.emission = 1.5 + flight.throttle * 4.0;
  }
}
