#version 300 es

// Volumetric clouds — raymarch fragment stage.
//
// For each pixel we reconstruct the world-space view ray and march the slice of
// it that passes through a flat cloud layer (a slab between cloudBaseY and
// cloudTopY). Cloud density is read from a tileable 3D value-noise volume baked
// once on the CPU (sampler3D, hence GLSL ES 3.00 / WebGL2): a single hardware-
// filtered fetch replaces the old per-sample multi-octave FBM. The volume is
// shaped by a coverage threshold and a vertical profile, then eroded by a
// higher-frequency tap of the same volume. Lighting is single-scattering: a
// short march toward the sun gives Beer's-law self-shadowing, combined with a
// Henyey-Greenstein phase (forward silver lining), a powder term for the dark
// edges, and a sky/ground ambient fill — driven by the (dynamic) sky's sun.
//
// Output is PREMULTIPLIED (in-scattered radiance, coverage alpha), composited
// over the scene later with blend (ONE, ONE_MINUS_SRC_ALPHA). Rendered at
// reduced resolution in a pre-pass.

precision highp float;
precision highp sampler3D;

in vec2 vNdc;
out vec4 fragColor;

uniform mat4 invViewProj;     // clip -> world
uniform vec3 cameraPos;
uniform vec3 sunDir;          // world-space direction toward the sun (normalized)
uniform vec3 sunColor;        // sun radiance (driven by the dynamic sky's sun tint)
uniform vec3 ambientColor;    // sky fill (cloud tops)
uniform vec3 groundColor;     // bounce fill (cloud bottoms)

uniform sampler3D noiseTex;   // baked tileable value-noise FBM (R channel)
uniform float noiseInvTile;   // q-space -> [0,1) texture tile scale

uniform float cloudBaseY;     // altitude of the layer's underside
uniform float cloudTopY;      // altitude of the layer's top
uniform float coverage;       // 0..1 global cloud coverage
uniform float extinction;     // optical density per world unit
uniform float detailScale;    // strength of the detail erosion
uniform float baseFreq;       // shape frequency (1 / world units)
uniform float time;           // wind drift (seconds * speed)
uniform vec2  windDir;        // horizontal wind direction
uniform float phaseG;         // Henyey-Greenstein anisotropy (0..1, forward)
uniform float sunAbsorption;  // light-march absorption scale
uniform float maxDist;        // furthest distance to march (world units)
uniform int   steps;          // view-ray samples
uniform int   lightSteps;     // sun-ward samples per lit step

#define PI 3.14159265359

// One fetch of the baked FBM volume (REPEAT-wrapped, so any coordinate tiles).
float sampleNoise(vec3 x) {
	return texture(noiseTex, x * noiseInvTile).r;
}

// Cheap base cloud shape (low-frequency only, no detail erosion), in [0, 1].
// One texture fetch. Used both as the empty-space probe for adaptive stepping
// and as the density for the sun-ward shadow march (shadows don't need the fine
// detail). `q` (the wind-advected, frequency-scaled sample point) is handed back
// so the full-density path can reuse it for the detail tap without recomputing.
float cloudShape(vec3 p, out float h, out vec3 q) {
	h = (p.y - cloudBaseY) / max(cloudTopY - cloudBaseY, 1.0);
	if (h < 0.0 || h > 1.0) { q = vec3(0.0); return 0.0; }

	vec3 wind = vec3(windDir.x, 0.0, windDir.y) * time;
	q = (p + wind) * baseFreq;

	// Large-scale weather modulation. The base noise tile repeats every ~1/(baseFreq*
	// noiseInvTile) world units, which reads as an identical grid toward the horizon.
	// A low-frequency tap of the same volume (much longer period, offset, non-integer
	// scale ratio) varies the local coverage region to region, so neighbouring tiles
	// differ — clouds gather into masses with clear lanes between, hiding the grid.
	float weather = sampleNoise(q * 0.19 + vec3(11.7, 3.3, 5.1));
	float localCoverage = clamp(coverage * (0.4 + 1.25 * weather), 0.0, 1.0);

	float d = sampleNoise(q) - (1.0 - localCoverage);   // coverage threshold
	if (d <= 0.0) return 0.0;

	// vertical profile: rounded base, wispy eroded top
	float profile = smoothstep(0.0, 0.2, h) * (1.0 - smoothstep(0.5, 1.0, h));
	return d * profile;
}

// base shape only (shadow march / probe variant that discards the reused q)
float cloudShape(vec3 p) {
	float h;
	vec3 q;
	return cloudShape(p, h, q);
}

// full shaped density including the high-frequency detail erosion, in [0, 1].
// A second noise tap — only taken once the cheap base shape says we're in a cloud.
float cloudDensity(vec3 p, out float h) {
	vec3 q;
	float d = cloudShape(p, h, q);
	if (d <= 0.0) return 0.0;

	// erode edges with higher-frequency detail (more toward the top). The detail
	// weight fades to zero at the cloud base, so skip the tap entirely there.
	float detailW = detailScale * smoothstep(0.2, 1.0, h);
	if (detailW > 1e-4) {
		d -= sampleNoise(q * 3.0 + 19.0) * detailW;
	}
	return clamp(d, 0.0, 1.0);
}

float hgPhase(float c, float g) {
	float g2 = g * g;
	return (1.0 - g2) / (4.0 * PI * pow(max(1.0 + g2 - 2.0 * g * c, 1.0e-4), 1.5));
}

void main(void) {
	// reconstruct the world-space view ray
	vec4 nearW = invViewProj * vec4(vNdc, -1.0, 1.0);
	vec4 farW  = invViewProj * vec4(vNdc,  1.0, 1.0);
	nearW /= nearW.w;
	farW  /= farW.w;
	vec3 ro = cameraPos;
	vec3 rd = normalize(farW.xyz - nearW.xyz);

	// the cloud layer is a horizontal slab: a near-horizontal ray runs parallel
	// to it and never enters, but rays angled either up (camera below) or down
	// (camera above the deck) do cross it, so reject only the parallel case.
	if (abs(rd.y) <= 0.002) discard;

	// intersect the ray with the cloud slab in Y
	float t0 = (cloudBaseY - ro.y) / rd.y;
	float t1 = (cloudTopY  - ro.y) / rd.y;
	float tEnter = max(min(t0, t1), 0.0);
	float tExit  = min(max(t0, t1), maxDist);
	if (tExit <= tEnter) discard;

	// `steps` sets the fine (in-cloud) step; empty space is skipped in coarser
	// jumps. baseStep already scales with the slant path length, so grazing rays
	// keep roughly the same sample count as overhead ones.
	float baseStep = (tExit - tEnter) / float(steps);
	float skipStep = baseStep * 2.0;   // coarse advance through clear sky

	// interleaved-gradient-noise dither to break slice banding
	float ign = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
	float t = tEnter + baseStep * ign;

	float phase = hgPhase(dot(rd, sunDir), phaseG);
	float lstep = (cloudTopY - cloudBaseY) / float(lightSteps) * 0.5;

	// Distance fade: dissolve far clouds into the sky (aerial perspective). This
	// also hides the noise tile repeating toward the horizon — the grazing rays
	// that stack up many identical tiles are exactly the ones that fade out.
	float fadeNear = maxDist * 0.18;
	float fadeFar  = maxDist * 0.7;

	float transmittance = 1.0;
	vec3 scattered = vec3(0.0);

	// Adaptive march: probe the cheap base shape; coast through empty sky in
	// coarse steps, and only pay for the full (detailed) density + sun-ward
	// shadow march once we're actually inside a cloud. The loop is bounded by
	// distance/transmittance, not a fixed count, so clear columns finish early.
	for (int i = 0; i < 192; i++) {
		if (t > tExit || t > fadeFar || transmittance < 0.02) break;

		vec3 p = ro + rd * t;
		float h;
		vec3 q;
		float shape = cloudShape(p, h, q);

		if (shape <= 0.0) {
			t += skipStep;   // clear sky — coast
			continue;
		}

		float d = cloudDensity(p, h);
		d *= 1.0 - smoothstep(fadeNear, fadeFar, t);   // fade with distance
		if (d > 0.002) {
			// short march toward the sun for self-shadowing (Beer's law), on the
			// cheap base shape — fine detail isn't needed to read as a shadow.
			// Bail out once the path to the sun is effectively opaque, since more
			// samples can no longer lighten exp(-opticalDepth).
			float lcoef = lstep * extinction * sunAbsorption;
			float ld = 0.0;
			for (int j = 0; j < 8; j++) {
				if (j >= lightSteps) break;
				ld += cloudShape(p + sunDir * (lstep * (float(j) + 0.5)));
				if (ld * lcoef > 5.0) break;
			}
			float lightTransmit = exp(-ld * lcoef);

			float powder = 1.0 - exp(-d * 3.0);          // darken thin edges
			vec3 sunLit = sunColor * (lightTransmit * phase * powder);
			vec3 ambient = mix(groundColor, ambientColor, clamp(h, 0.0, 1.0));
			vec3 lum = sunLit + ambient;

			float sigma = d * extinction * baseStep;
			float st = exp(-sigma);
			scattered += transmittance * (1.0 - st) * lum;
			transmittance *= st;
		}

		t += baseStep;
	}

	float alpha = 1.0 - transmittance;
	alpha *= smoothstep(0.0, 0.05, abs(rd.y));   // soft fade toward the horizon (both above and below the deck)
	if (alpha < 0.002) discard;

	fragColor = vec4(scattered, alpha);  // premultiplied
}
