
import { Vec3, Vec4 } from "@/math";

// VolumetricLight — screen-space crepuscular rays ("god rays" / 薄明光線 /
// ボリュームライト) cast by scene geometry occluding the sun.
//
// Like LensFlare, this is a 2D-overlay effect: it needs no extra render
// targets, shaders or pipeline changes, so it composites cleanly over the 3D
// image (and pairs naturally with a LensFlare on the same sun). The visible sun
// usually lives in the skybox, so you give the effect a world-space
// `direction` pointing *toward* the sun (or `follow: scene.sun`); every frame it
//
//   1. projects that direction to a screen-space sun position,
//   2. paints an occlusion mask — a bright warm sun disc, then the silhouettes
//      of the `occluders` (e.g. the city's cubes) punched out in black,
//   3. radially smears that mask outward from the sun (a "zoom blur"), so the
//      light leaks through the gaps between the buildings as shafts, and
//   4. additively blends the result onto the renderer's 2D overlay.
//
// Because the shafts come from real projected geometry, the rays are genuinely
// shaped by — and shadowed by — the occluders: light streams between and over
// the buildings exactly where the sky is unobstructed.
//
//   const god = new VolumetricLight(scene, {
//     follow: scene.sun,          // toward the sun, world space (tracks live)
//     occluders: cityCubes,       // SceneObjects that block the sun
//     color: [1.0, 0.86, 0.62],   // warm shaft tint
//     intensity: 0.9,
//   });
//
// Occluder silhouettes are taken as the convex hull of each object's local
// unit-cube corners (±0.5) transformed to the screen — exact for `Cube` shapes
// scaled into buildings, and a good bounding silhouette for anything else.
// Override per shape with `obj.volumetricBounds = { min:[x,y,z], max:[x,y,z] }`.
//
// For things with no hard silhouette — clouds, smoke, dust — pass `softOccluders`
// instead: providers that yield a cloud of soft blobs, stamped as fuzzy discs so
// the light filters through the gaps (e.g. a `Clouds` effect, which exposes
// `forEachVolumetricOccluder`):
//
//   const rays = new VolumetricLight(scene, {
//     follow: scene.sun,
//     softOccluders: [clouds],    // sun's shafts break through the cloud gaps
//   });
//
// It hooks the scene's "frame" event itself; call `dispose()` to remove it.
export class VolumetricLight {
  constructor(scene, options = {}) {
    this.scene = scene;
    this.renderer = scene.renderer;

    this.enabled = options.enabled !== false;

    // direction pointing toward the sun (world space), stored normalised.
    this._dir = new Vec3(0.0, 0.25, -1.0);
    if (options.direction) this.setDirection(options.direction);

    // optional live source (e.g. scene.sun): read every frame so the shafts
    // track the same direction that drives the lens flare / water glitter.
    this._follow = null;
    if (options.follow) this.setFollow(options.follow);

    // objects that block the sun and so carve the shafts (the city cubes).
    // These are *hard* occluders: silhouetted as the convex hull of their
    // transformed corner box (see `localBounds`).
    this.occluders = Array.isArray(options.occluders) ? options.occluders : [];

    // soft, volumetric occluders — for things with no hard silhouette (clouds,
    // smoke, dust). Each entry is a *provider* that yields a cloud of soft
    // blobs, stamped into the mask as fuzzy discs so the light filters through
    // the gaps instead of being cut by hard edges. A provider is either an
    // object exposing `forEachVolumetricOccluder(cb)` (e.g. a `Clouds` effect)
    // or a function `(cb) => …`; `cb` is called `cb(x, y, z, radius, alpha)`
    // with a world-space centre, world radius and 0..1 occlusion strength.
    this.softOccluders = Array.isArray(options.softOccluders) ? options.softOccluders : [];

    // global multiplier on every soft blob's occlusion strength.
    this.softOcclusion = (typeof options.softOcclusion === "number") ? options.softOcclusion : 1.0;

    // warm shaft tint (linear-ish RGB 0..1) and overall strength.
    this.color = options.color || [1.0, 0.86, 0.62];
    this.intensity = (typeof options.intensity === "number") ? options.intensity : 0.9;

    // --- radial-scatter controls ----------------------------------------
    // `density`  — how far the rays reach: the maximum outward zoom of the mask
    //              (0.6 ≈ rays stretch ~60% across the frame).
    // `decay`    — per-step brightness falloff along each ray (<1 fades the tail).
    // `weight`   — brightness contributed by each scatter step.
    // `samples`  — scatter steps; more = smoother, longer rays (and more cost).
    this.density = (typeof options.density === "number") ? options.density : 0.65;
    this.decay   = (typeof options.decay === "number") ? options.decay : 0.95;
    this.weight  = (typeof options.weight === "number") ? options.weight : 0.5;
    this.samples = (typeof options.samples === "number") ? Math.max(2, options.samples | 0) : 48;

    // size of the sun disc in the mask, as a fraction of the smaller viewport
    // dimension. Larger = a broader, softer source and fatter shafts.
    this.sunSize = (typeof options.sunSize === "number") ? options.sunSize : 0.16;

    // render the mask at this fraction of the overlay resolution. The radial
    // blur is naturally soft, so a downscaled mask looks the same and keeps the
    // per-frame drawImage cost low.
    this.downscale = (typeof options.downscale === "number") ? options.downscale : 0.5;

    // fade the shafts out as the sun sinks to/below the horizon.
    this.fadeBelowHorizon = options.fadeBelowHorizon !== false;

    // local-space corner box used to build an occluder's silhouette. A `Cube`
    // mesh spans ±0.5, so the default captures buildings made from scaled cubes.
    this.localBounds = options.localBounds || { min: [-0.5, -0.5, -0.5], max: [0.5, 0.5, 0.5] };

    // offscreen scratch canvases (mask + accumulation), sized lazily per frame.
    this._mask = document.createElement("canvas");
    this._maskCtx = this._mask.getContext("2d");
    this._acc = document.createElement("canvas");
    this._accCtx = this._acc.getContext("2d");

    // a reusable soft-edged disc sprite, built on first use, stamped per soft
    // blob (drawImage is far cheaper than a fresh radial gradient each time).
    this._softSprite = null;

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

  setFollow(target) {
    this._follow = target || null;
    return this;
  }

  setOccluders(objects) {
    this.occluders = Array.isArray(objects) ? objects : [];
    return this;
  }

  setSoftOccluders(providers) {
    this.softOccluders = Array.isArray(providers) ? providers : [];
    return this;
  }

  // Build (once) the soft disc sprite: opaque at the core, feathering to zero
  // at the rim. Its alpha is what `destination-out` reads to erase the sun disc
  // softly, so overlapping blobs build up a fuzzy, gap-toothed cloud silhouette.
  _buildSoftSprite() {
    const S = 128;
    const c = document.createElement("canvas");
    c.width = S; c.height = S;
    const cx = S / 2;
    const g = c.getContext("2d");
    const grd = g.createRadialGradient(cx, cx, 0, cx, cx, cx);
    grd.addColorStop(0.0, "rgba(0,0,0,1)");
    grd.addColorStop(0.45, "rgba(0,0,0,0.96)");
    grd.addColorStop(0.75, "rgba(0,0,0,0.5)");
    grd.addColorStop(1.0, "rgba(0,0,0,0)");
    g.fillStyle = grd;
    g.fillRect(0, 0, S, S);
    this._softSprite = c;
    return c;
  }

  // World-space unit "right" axis of the camera, used to turn a blob's world
  // radius into a screen radius (project the centre and a point one radius to
  // its side; the pixel gap between them is the on-screen radius).
  _cameraRightWorld(renderer) {
    const c2w = renderer.viewMatrix.mul(renderer.cameraMatrix).inverse();
    const o = new Vec4(0, 0, 0, 1).mulMat(c2w);
    const rx = new Vec4(1, 0, 0, 1).mulMat(c2w);
    let dx = rx.x - o.x, dy = rx.y - o.y, dz = rx.z - o.z;
    const len = Math.hypot(dx, dy, dz) || 1;
    return { x: dx / len, y: dy / len, z: dz / len };
  }

  dispose() {
    if (this._onFrame && this.scene.removeEventListener) {
      this.scene.removeEventListener("frame", this._onFrame);
    }
    this._onFrame = null;
  }

  // Project a world point to an overlay pixel. Returns { x, y, behind } where
  // `behind` is true when the point is at/behind the camera plane (w <= 0).
  _projectPoint(p, renderer) {
    const clip = new Vec4(p.x, p.y, p.z, 1.0).mulMat(renderer.projectionViewMatrix);
    if (clip.w <= 0.00001) return { x: 0, y: 0, behind: true };
    const halfW = renderer.renderSize.width / 2;
    const halfH = renderer.renderSize.height / 2;
    return {
      x: (clip.x / clip.w) * halfW + halfW,
      y: -(clip.y / clip.w) * halfH + halfH,
      behind: false,
    };
  }

  // Project the (infinitely far) sun direction to an overlay pixel.
  _projectSun(renderer) {
    const BIG = 1e6;
    return this._projectPoint(
      { x: this._dir.x * BIG, y: this._dir.y * BIG, z: this._dir.z * BIG },
      renderer);
  }

  // Project one occluder to a screen-space silhouette polygon (convex hull of
  // its transformed corner box). Returns null when the object straddles the
  // camera plane (any corner behind), so we never fill a garbage silhouette.
  _occluderSilhouette(obj, renderer, scale) {
    const m = obj._transform;
    if (!m) return null;

    const b = obj.volumetricBounds || this.localBounds;
    const mn = b.min, mx = b.max;
    const pts = [];
    for (let xi = 0; xi < 2; xi++) {
      for (let yi = 0; yi < 2; yi++) {
        for (let zi = 0; zi < 2; zi++) {
          const local = new Vec4(
            xi ? mx[0] : mn[0],
            yi ? mx[1] : mn[1],
            zi ? mx[2] : mn[2],
            1.0);
          const world = local.mulMat(m);
          const sp = this._projectPoint({ x: world.x, y: world.y, z: world.z }, renderer);
          if (sp.behind) return null;
          pts.push({ x: sp.x * scale, y: sp.y * scale });
        }
      }
    }
    return convexHull(pts);
  }

  draw() {
    if (!this.enabled || this.intensity <= 0) return;

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

    const sun = this._projectSun(renderer);
    if (sun.behind) return;

    const unit = Math.min(w, h);

    // --- visibility: fade as the sun leaves the frame or dips below horizon --
    const ox = Math.max(0, -sun.x, sun.x - w);
    const oy = Math.max(0, -sun.y, sun.y - h);
    const off = Math.hypot(ox, oy);
    let vis = clamp01(1 - off / (unit * 0.6));
    if (this.fadeBelowHorizon) vis *= smoothstep(-0.08, 0.12, this._dir.y);
    if (vis <= 0.003) return;

    // --- size the scratch canvases (downscaled mask) ------------------------
    const scale = this.downscale;
    const mw = Math.max(8, Math.round(w * scale));
    const mh = Math.max(8, Math.round(h * scale));
    if (this._mask.width !== mw || this._mask.height !== mh) {
      this._mask.width = mw; this._mask.height = mh;
      this._acc.width = mw; this._acc.height = mh;
    }

    const sx = sun.x * scale, sy = sun.y * scale;
    const mctx = this._maskCtx, actx = this._accCtx;

    // --- 1. occlusion mask --------------------------------------------------
    // Built on a *transparent* field so the mask's alpha carries the light: a
    // warm sun disc that fades to alpha 0, with the occluder silhouettes erased
    // back to transparent. (A black-filled field would instead accumulate to an
    // opaque overlay under additive blending and black out the 3D image.)
    mctx.setTransform(1, 0, 0, 1, 0, 0);
    mctx.globalCompositeOperation = "source-over";
    mctx.globalAlpha = 1;
    mctx.clearRect(0, 0, mw, mh);

    const sunR = unit * this.sunSize * scale;
    const g = mctx.createRadialGradient(sx, sy, 0, sx, sy, sunR);
    g.addColorStop(0.0, rgba([1, 1, 1], 1.0));            // hot core
    g.addColorStop(0.30, rgba(this.color, 0.9));
    g.addColorStop(1.0, rgba(this.color, 0.0));           // edge → transparent
    mctx.fillStyle = g;
    mctx.beginPath();
    mctx.arc(sx, sy, sunR, 0, Math.PI * 2);
    mctx.fill();

    // erase the occluder silhouettes from the disc — buildings cast no light,
    // so they punch transparent holes the radial blur then stretches into shafts
    mctx.globalCompositeOperation = "destination-out";
    mctx.fillStyle = "rgba(0,0,0,1)";
    for (const obj of this.occluders) {
      if (!obj || obj.visible === false) continue;
      const hull = this._occluderSilhouette(obj, renderer, scale);
      if (!hull || hull.length < 3) continue;
      mctx.beginPath();
      mctx.moveTo(hull[0].x, hull[0].y);
      for (let i = 1; i < hull.length; i++) mctx.lineTo(hull[i].x, hull[i].y);
      mctx.closePath();
      mctx.fill();
    }

    // soft, volumetric occluders (e.g. cloud puffs): stamp each blob as a fuzzy
    // disc, so the light filters through the gaps and thins at the cloud edges
    // instead of being cut by a hard outline. Still in destination-out, so the
    // blobs erase the sun disc; overlapping blobs build up denser shadow.
    if (this.softOccluders.length) {
      const sprite = this._softSprite || this._buildSoftSprite();
      const right = this._cameraRightWorld(renderer);
      const strength = this.softOcclusion;
      const maxRad = Math.max(mw, mh) * 2;   // clamp absurd near-camera blobs
      const stamp = (x, y, z, r, a) => {
        if (!(r > 0) || !(a > 0)) return;
        const pc = this._projectPoint({ x, y, z }, renderer);
        if (pc.behind) return;
        const pe = this._projectPoint(
          { x: x + right.x * r, y: y + right.y * r, z: z + right.z * r }, renderer);
        if (pe.behind) return;
        let sr = Math.hypot(pe.x - pc.x, pe.y - pc.y) * scale;
        if (sr < 0.5) return;
        if (sr > maxRad) sr = maxRad;
        const gx = pc.x * scale, gy = pc.y * scale;
        if (gx + sr < 0 || gx - sr > mw || gy + sr < 0 || gy - sr > mh) return;  // off-canvas
        mctx.globalAlpha = clamp01(a * strength);
        mctx.drawImage(sprite, gx - sr, gy - sr, sr * 2, sr * 2);
      };
      for (const p of this.softOccluders) {
        if (!p) continue;
        if (typeof p.forEachVolumetricOccluder === "function") p.forEachVolumetricOccluder(stamp);
        else if (typeof p === "function") p(stamp);
      }
      mctx.globalAlpha = 1;
    }

    mctx.globalCompositeOperation = "source-over";

    // --- 2. radial scatter: smear the mask outward from the sun -------------
    actx.setTransform(1, 0, 0, 1, 0, 0);
    actx.globalCompositeOperation = "source-over";
    actx.globalAlpha = 1;
    actx.clearRect(0, 0, mw, mh);

    actx.globalCompositeOperation = "lighter";
    const n = this.samples;
    let illum = 1.0;
    for (let i = 0; i < n; i++) {
      // k grows from 1 → 1+density: each copy zooms the mask out from the sun,
      // so a texel at the sun spreads along the ray toward the frame edges.
      const k = 1 + this.density * (i / (n - 1));
      actx.globalAlpha = this.weight * illum;
      actx.setTransform(k, 0, 0, k, sx * (1 - k), sy * (1 - k));
      actx.drawImage(this._mask, 0, 0);
      illum *= this.decay;
    }
    actx.setTransform(1, 0, 0, 1, 0, 0);
    actx.globalAlpha = 1;
    actx.globalCompositeOperation = "source-over";

    // --- 3. composite the shafts onto the 3D overlay ------------------------
    // The accumulation is warm light on transparent: drawn additively, its alpha
    // (the ray brightness) blends it over the 3D image, so shafts glow where the
    // sky is open and fade to nothing in the towers' shadows.
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = clamp01(vis * this.intensity);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(this._acc, 0, 0, mw, mh, 0, 0, w, h);
    ctx.restore();
  }
}

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

// Andrew's monotone-chain convex hull of up to a handful of 2D points. The
// screen silhouette of a convex box is exactly the hull of its projected
// corners, so this turns 8 corners into a fillable outline.
function convexHull(points) {
  const pts = points.slice().sort((a, b) => (a.x - b.x) || (a.y - b.y));
  if (pts.length < 3) return pts;

  const cross = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);

  const lower = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  lower.pop();
  upper.pop();
  return lower.concat(upper);
}
