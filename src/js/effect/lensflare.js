
import { Vec3, Vec4 } from "@/math";

// LensFlare — a 2D-overlay sun/lens flare ("太陽フレア").
//
// The visible sun in Yotei3D usually lives in the skybox (HDR or cubemap), so
// there is no scene light to anchor to. You give the flare a world-space
// `direction` pointing *toward* the sun; the effect projects that direction
// onto the screen every frame and paints the classic lens-flare stack —
// a bright core glow, a starburst, an anamorphic streak, and a chain of
// chromatic "ghost" discs marching from the sun through the screen centre —
// onto the renderer's 2D overlay canvas (so it composites over the 3D image,
// independent of bloom/post-process).
//
//   const flare = new LensFlare(scene, {
//     direction: [0.35, 0.45, -0.82],   // toward the sun, world space
//     intensity: 1.0,
//   });
//
// Or bind it to a scene light so it tracks live (same source the water uses):
//
//   const flare = new LensFlare(scene, { follow: scene.sun });
//
// It hooks the scene's "frame" event itself; call `dispose()` to remove it.
export class LensFlare {
  constructor(scene, options = {}) {
    this.scene = scene;
    this.renderer = scene.renderer;

    this.enabled = options.enabled !== false;

    // direction pointing toward the sun (world space). Stored normalised.
    this._dir = new Vec3(0.35, 0.45, -0.82);
    if (options.direction) this.setDirection(options.direction);

    // optional live source: an object exposing `.worldLocation` (or `.location`)
    // read every frame, so the flare follows e.g. `scene.sun` as it moves. This
    // is the same value the water shader normalises for its sun glitter, so the
    // flare, the reflected sun and the glitter road all stay in lock-step.
    this._follow = null;
    if (options.follow) this.setFollow(options.follow);

    // core glow colour, linear-ish RGB in 0..1
    this.color = options.color || [1.0, 0.94, 0.82];

    // strength of the flare's ghost chain — the chromatic discs/rings that
    // march from the sun across the frame. Independent of the sun core.
    this.intensity = (typeof options.intensity === "number") ? options.intensity : 1.0;

    // strength of the bright sun point and its on-axis glints: the core glow,
    // hot white centre, corona, the starburst spikes (the 米-shaped rays) and
    // the anamorphic streak. Tune separately from `intensity` (the ghosts), so
    // the spikes fade together with the sun dot instead of lingering alone.
    this.coreIntensity = (typeof options.coreIntensity === "number") ? options.coreIntensity : 1.0;

    // base size as a fraction of the smaller viewport dimension
    this.scale = (typeof options.scale === "number") ? options.scale : 1.0;

    // optional flourishes
    this.starburst = options.starburst !== false;
    this.streak = options.streak !== false;
    this.fadeBelowHorizon = options.fadeBelowHorizon !== false;

    // optional occlusion hook: (screenX, screenY) => visibility 0..1.
    // Return 0 when the sun is hidden behind geometry, 1 when fully visible.
    this.occlude = (typeof options.occlude === "function") ? options.occlude : null;

    // automatic occlusion: scene objects that can hide the sun. When set, the
    // flare casts a ray toward the sun each frame and fades out while that ray
    // is blocked by one of these objects (e.g. a tall island/terrain). The ray
    // test reuses the scene's mesh ray-pick, which bbox-culls first, so an
    // unobstructed sun costs almost nothing.
    this.occluders = Array.isArray(options.occluders) ? options.occluders : null;

    // how fast occlusion fades in/out per frame (0..1); avoids a hard pop as
    // the sun winks behind an edge. 1 = instant.
    this.occlusionFade = (typeof options.occlusionFade === "number") ? options.occlusionFade : 0.2;
    this._occ = 1;   // smoothed occlusion visibility

    // ghost stack: each marches along the sun -> screen-centre axis at factor
    // `t` (0 = sun, 1 = centre, >1 = past it), with a size multiplier, tint and
    // ring/disc style. Pass `options.ghosts` to override, `false` to disable.
    if (options.ghosts === false) {
      this.ghosts = [];
    } else if (Array.isArray(options.ghosts)) {
      this.ghosts = options.ghosts;
    } else {
      this.ghosts = LensFlare.defaultGhosts;
    }

    this._onFrame = () => this.draw();
    this.scene.on("frame", this._onFrame);
  }

  setDirection(dir) {
    const x = dir.x !== undefined ? dir.x : dir[0];
    const y = dir.y !== undefined ? dir.y : dir[1];
    const z = dir.z !== undefined ? dir.z : dir[2];
    const len = Math.hypot(x, y, z) || 1;
    this._dir.set(x / len, y / len, z / len);
    return this;
  }

  // Track a live object (e.g. scene.sun). Pass null to stop following and keep
  // the last/explicit direction.
  setFollow(target) {
    this._follow = target || null;
    return this;
  }

  // Set the objects that can occlude the sun (e.g. [island]). Pass null to
  // disable automatic occlusion.
  setOccluders(objects) {
    this.occluders = Array.isArray(objects) ? objects : null;
    return this;
  }

  dispose() {
    if (this._onFrame && this.scene.removeEventListener) {
      this.scene.removeEventListener("frame", this._onFrame);
    }
    this._onFrame = null;
  }

  // Project the sun direction to a screen pixel, returning { x, y, behind }.
  // The sun is treated as infinitely far, so we project a point a long way
  // down the direction vector; camera translation is then negligible and only
  // the camera's orientation decides where it lands.
  _project(renderer) {
    const BIG = 1e6;
    const anchor = new Vec3(this._dir.x * BIG, this._dir.y * BIG, this._dir.z * BIG);
    const clip = new Vec4(anchor, 1.0).mulMat(renderer.projectionViewMatrix);

    // w <= 0 means the sun is at or behind the camera plane.
    if (clip.w <= 0.00001) return { x: 0, y: 0, behind: true };

    const halfW = renderer.renderSize.width / 2;
    const halfH = renderer.renderSize.height / 2;
    return {
      x: (clip.x / clip.w) * halfW + halfW,
      y: -(clip.y / clip.w) * halfH + halfH,
      behind: false,
    };
  }

  draw() {
    if (!this.enabled) return;

    // live-follow: refresh the direction from the tracked light each frame.
    // Prefer a `.direction` (e.g. scene.sun) and fall back to a world position.
    if (this._follow) {
      const dir = this._follow.direction || this._follow.worldLocation || this._follow.location;
      if (dir) this.setDirection(dir);
    }

    const renderer = this.renderer;
    const dc = renderer.drawingContext2D;
    const ctx = dc && dc.ctx;
    if (!ctx) return;

    const w = renderer.renderSize.width, h = renderer.renderSize.height;
    if (w <= 0 || h <= 0) return;

    const sun = this._project(renderer);
    if (sun.behind) return;

    const unit = Math.min(w, h);
    const cx = w / 2, cy = h / 2;

    // --- visibility ------------------------------------------------------
    // Fade as the sun leaves the frame (measured by how far outside the
    // viewport it sits, with a soft margin band).
    const ox = Math.max(0, -sun.x, sun.x - w);
    const oy = Math.max(0, -sun.y, sun.y - h);
    const off = Math.hypot(ox, oy);
    const margin = unit * 0.35;
    let vis = clamp01(1 - off / margin);

    // Fade out as the sun sinks toward/below the horizon (dir.y -> 0).
    if (this.fadeBelowHorizon) {
      vis *= smoothstep(-0.05, 0.12, this._dir.y);
    }

    // occlusion: hide the flare when something blocks the line to the sun.
    // Cast a ray toward the sun's screen position and test the occluder set;
    // combine with any custom occlude() hook, then smooth so it fades not pops.
    let occTarget = 1;
    if (this.occluders && this.occluders.length && vis > 0.002) {
      const occluders = this.occluders;
      const hit = this.scene.findObjectsByViewPosition(
        { x: sun.x, y: sun.y },
        { filter: (o) => occluders.indexOf(o) >= 0 }
      );
      if (hit && hit.object) occTarget = 0;
    }
    if (this.occlude) {
      occTarget *= clamp01(this.occlude(sun.x, sun.y));
    }
    const fade = clamp01(this.occlusionFade);
    this._occ += (occTarget - this._occ) * fade;
    vis *= this._occ;

    // `vis` is now the geometric visibility (edge + horizon + occlusion fades),
    // shared by both the sun core and the flare. The two are scaled separately:
    // the sun point by coreIntensity, the decorations by intensity.
    if (vis <= 0.002) return;

    const coreAlpha = clamp01(vis * this.coreIntensity);
    const flareAlpha = clamp01(vis * this.intensity);

    // axis from the sun through the screen centre (the ghost line)
    const ax = cx - sun.x, ay = cy - sun.y;

    ctx.save();
    ctx.globalCompositeOperation = "lighter";   // additive

    // ===== sun core (coreIntensity): the bright point + its halo ==========
    ctx.globalAlpha = coreAlpha;

    // --- main core glow --------------------------------------------------
    const glowR = 0.17 * unit * this.scale;
    radialDisc(ctx, sun.x, sun.y, glowR, [
      [0.0, this.color, 0.95],
      [0.25, this.color, 0.45],
      [1.0, this.color, 0.0],
    ]);

    // hot white centre
    radialDisc(ctx, sun.x, sun.y, glowR * 0.35, [
      [0.0, [1, 1, 1], 0.9],
      [1.0, this.color, 0.0],
    ]);

    // soft wide corona
    radialDisc(ctx, sun.x, sun.y, glowR * 2.4, [
      [0.0, this.color, 0.10],
      [1.0, this.color, 0.0],
    ]);

    // --- starburst spikes (a glint of the sun point — scales with the core) -
    if (this.starburst) {
      const spikes = 12;
      ctx.lineCap = "round";
      for (let i = 0; i < spikes; i++) {
        const a = (i / spikes) * Math.PI * 2;
        const long = (i % 2 === 0);
        const len = glowR * (long ? 2.2 : 1.2);
        const ex = sun.x + Math.cos(a) * len;
        const ey = sun.y + Math.sin(a) * len;
        const g = ctx.createLinearGradient(sun.x, sun.y, ex, ey);
        g.addColorStop(0, rgba(this.color, long ? 0.5 : 0.3));
        g.addColorStop(1, rgba(this.color, 0));
        ctx.strokeStyle = g;
        ctx.lineWidth = long ? 2 : 1.2;
        ctx.beginPath();
        ctx.moveTo(sun.x, sun.y);
        ctx.lineTo(ex, ey);
        ctx.stroke();
      }
    }

    // --- anamorphic horizontal streak -----------------------------------
    if (this.streak) {
      const half = w * 0.55;
      const g = ctx.createLinearGradient(sun.x - half, sun.y, sun.x + half, sun.y);
      g.addColorStop(0.0, rgba([0.6, 0.78, 1.0], 0));
      g.addColorStop(0.5, rgba([0.7, 0.85, 1.0], 0.22));
      g.addColorStop(1.0, rgba([0.6, 0.78, 1.0], 0));
      ctx.fillStyle = g;
      const sh = Math.max(2, unit * 0.006);
      ctx.fillRect(sun.x - half, sun.y - sh * 0.5, half * 2, sh);
    }

    // ===== flare ghosts (intensity): the reflection chain off the sun ======
    ctx.globalAlpha = flareAlpha;

    // --- ghosts ----------------------------------------------------------
    const ghostBase = 0.05 * unit * this.scale;
    for (const ghost of this.ghosts) {
      const t = ghost.t;
      const gx = sun.x + ax * t;
      const gy = sun.y + ay * t;
      const r = ghostBase * (ghost.r || 1);
      const col = ghost.color || this.color;
      const a = (ghost.alpha !== undefined ? ghost.alpha : 0.25);

      if (ghost.ring) {
        const g = ctx.createRadialGradient(gx, gy, r * 0.7, gx, gy, r);
        g.addColorStop(0, rgba(col, 0));
        g.addColorStop(0.7, rgba(col, a));
        g.addColorStop(1, rgba(col, 0));
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(gx, gy, r, 0, Math.PI * 2);
        ctx.fill();
      } else {
        radialDisc(ctx, gx, gy, r, [
          [0.0, col, a],
          [0.6, col, a * 0.4],
          [1.0, col, 0.0],
        ]);
      }
    }

    ctx.restore();
  }
}

// default chromatic ghost stack (tuned for a warm sun over cool sky)
LensFlare.defaultGhosts = [
  { t: 0.28, r: 0.55, color: [0.45, 0.70, 1.0], alpha: 0.22 },
  { t: 0.50, r: 1.10, color: [1.0, 0.85, 0.55], alpha: 0.16 },
  { t: 0.72, r: 0.40, color: [0.55, 1.0, 0.80], alpha: 0.20 },
  { t: 1.00, r: 0.95, color: [1.0, 0.62, 0.45], alpha: 0.18, ring: true },
  { t: 1.22, r: 0.65, color: [0.55, 0.62, 1.0], alpha: 0.18 },
  { t: 1.45, r: 1.40, color: [1.0, 0.78, 0.55], alpha: 0.10, ring: true },
  { t: 1.68, r: 0.50, color: [0.75, 0.55, 1.0], alpha: 0.16 },
];

////////////////////////////////////////////////////////////////////////////////

function clamp01(v) {
  return v < 0 ? 0 : (v > 1 ? 1 : v);
}

function smoothstep(edge0, edge1, x) {
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

function rgba(rgb, a) {
  const r = Math.round(clamp01(rgb[0]) * 255);
  const g = Math.round(clamp01(rgb[1]) * 255);
  const b = Math.round(clamp01(rgb[2]) * 255);
  return `rgba(${r},${g},${b},${a})`;
}

// fill a radial disc from `stops` = [[offset, rgb, alpha], ...]
function radialDisc(ctx, x, y, r, stops) {
  if (r <= 0) return;
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  for (const [offset, rgb, a] of stops) {
    g.addColorStop(clamp01(offset), rgba(rgb, a));
  }
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}
