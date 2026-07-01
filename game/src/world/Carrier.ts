import { SceneObject } from '@';
import type { Scene } from '@';
import { Vec3 } from '@/math';

const CARRIER_URL = '/models/carrier/scene.gltf';

// The model arrives standing on its stern (long axis = glTF +Y), so we bake a
// −90° about X at load time → deck up, hull length along Z, bow = local −Z.
const ORIENT = [-90, 0, 0];
const DECK_LENGTH = 230; // engine units along the deck (keeps the jet-to-ship ratio realistic)
const DRAFT = 8; // how far the keel sits below the waterline (y = 0)

// Fallback flight-deck height as a fraction of the scaled hull height, used only if
// the ray-cast measurement (measureDeckTop) fails. Measured deck ≈ y 12.5 → ≈ 0.39.
const DECK_HEIGHT_FRAC = 0.39;

const AIRCRAFT_GEAR_HEIGHT = 2.5; // how high the jet sits above the keel when on its gear (for touchdown judge)

export interface CarrierFit {
  rawSize: { x: number; y: number; z: number };
  scale: number;
  deckLength: number;
  worldSize: { x: number; y: number; z: number };
}

/**
 * The USS Eisenhower (CVN-69) carrier. Loads the glTF, auto-fits it onto the
 * origin sitting on the waterline, fixes the deck material, and repairs the
 * frustum-cull bounds. The model rides an empty `holder` pivot so later phases
 * can move/turn the whole ship (carrier underway) without disturbing the fit.
 *
 * Auto-fit + cull-bounds knowledge is ported from landing-p1/p2 — see
 * LANDING-SPECS.md §5 for the measured numbers and the culling gotcha.
 */
export class Carrier {
  readonly holder = new SceneObject();
  root: SceneObject | null = null;
  deckTopY = 14; // jet-origin resting height on the deck (deck surface + gear); measured on load
  fit: CarrierFit | null = null;

  constructor(private readonly scene: Scene) {
    scene.add(this.holder);
  }

  /** Kick off the async load. Resolves with the fit once the model is in place. */
  load(): Promise<CarrierFit> {
    return new Promise((resolve, reject) => {
      this.scene.createObjectFromURL(
        CARRIER_URL,
        (root: any) => {
          if (!root) {
            console.error('failed to load carrier scene.gltf');
            reject(new Error('carrier load failed'));
            return;
          }
          this.root = root;
          this.holder.add(root);

          // ORIENT is baked in at load, so root is already lying flat with a clean
          // angle. Measure the oriented bounds and apply scale/offset analytically.
          const bb = root.getBounds();
          const sz = bb.size,
            mn = bb.min,
            mx = bb.max;
          const cx = (mn.x + mx.x) / 2,
            cz = (mn.z + mx.z) / 2;
          const s = DECK_LENGTH / Math.max(sz.x, sz.z);

          root.scale.set(s, s, s);
          // centre on origin in X/Z; lift so the scaled keel sits DRAFT below y=0.
          root.location.set(-s * cx, -s * mn.y - DRAFT, -s * cz);
          // Initial estimate of the flight-deck surface height (~0.39 up the scaled
          // hull, above the waterline). This is only a FALLBACK — after the bounds
          // are repaired below we ray-cast the actual deck to get the true value.
          this.deckTopY = sz.y * s * DECK_HEIGHT_FRAC - DRAFT;

          this.fit = {
            rawSize: { x: +sz.x.toFixed(2), y: +sz.y.toFixed(2), z: +sz.z.toFixed(2) },
            scale: +s.toFixed(4),
            deckLength: DECK_LENGTH,
            worldSize: {
              x: +(sz.x * s).toFixed(1),
              y: +(sz.y * s).toFixed(1),
              z: +(sz.z * s).toFixed(1),
            },
          };

          // The glTF's original deck material is too shiny — calm it down.
          this.holder.eachChild((c: any) => {
            if (c.name === 'Object_3') {
              c.mat.roughness = 0.7;
              c.mat.metallic = 0.5;
            }
          });

          // The measurement above cached the *pre-scale* bounds, which the renderer
          // reuses for frustum culling. Left stale, the carrier gets culled from
          // most angles; a missing cache culls it outright. So invalidate the holder
          // subtree and immediately recompute the correct final world bounds.
          const refreshBounds = (o: any) => {
            o._cachedBbox = undefined;
            if (o.objects) o.objects.forEach(refreshBounds);
          };
          refreshBounds(this.holder);
          this.holder.getBounds();

          // getBounds() above ensures the world transforms, so we can now ray-cast
          // straight down onto the deck to measure its true surface height (the
          // fraction heuristic above is only a fallback). The jet's origin rests on
          // its gear AIRCRAFT_GEAR_HEIGHT above that surface, and this deckTopY is what
          // the touchdown judge pins the jet's origin to — so fold the gear height in.
          this.deckTopY = this._measureDeckTop() + AIRCRAFT_GEAR_HEIGHT;

          this.scene.requireUpdateFrame();
          resolve(this.fit);
        },
        { baseTransform: { angle: ORIENT } },
      );
    });
  }

  /**
   * Ray-cast straight down onto the flight deck to find its true surface height.
   * Samples a few centreline points in the aft touchdown zone (avoiding the
   * starboard island) and takes the median. Returns the fraction-based fallback
   * (`this.deckTopY`) if the rays miss or give an implausible value.
   */
  private _measureDeckTop(): number {
    const holder = this.holder;
    const inCarrier = (o: any) => {
      for (let p = o; p; p = p.parent) if (p === holder) return true;
      return false;
    };
    const sampleY = (x: number, z: number): number | null => {
      const ray = { origin: new Vec3(x, 400, z), dir: new Vec3(0, -1, 0) };
      const out = this.scene.findObjectsByWorldRay(ray, { filter: inCarrier });
      if (!out?.hits?.length) return null;
      let topY = -Infinity;
      for (const h of out.hits) if (h.worldPosition && h.worldPosition.y > topY) topY = h.worldPosition.y;
      return Number.isFinite(topY) ? topY : null;
    };

    const ys: number[] = [];
    for (const z of [10, 30, 50, 70]) {
      const y = sampleY(0, z);
      if (y != null) ys.push(y);
    }
    if (!ys.length) return this.deckTopY; // fallback: rays missed

    ys.sort((a, b) => a - b);
    const median = ys[Math.floor(ys.length / 2)];
    // sanity: a real flight deck is above the waterline and below the island/mast
    return median > 2 && median < 30 ? median : this.deckTopY;
  }
}
