
precision highp float;

// Ocean surface shading.
//
// Sky reflection is taken from the scene's environment cubemap (the skybox) —
// the very same map the renderer already bakes IBL from — so there is no extra
// reflection render pass. Skyless scenes fall back to a cheap procedural sky
// gradient. A Fresnel term fades between the deep water body colour (steep
// view) and that sky reflection (grazing view); high-frequency scrolling
// ripples perturb the wave normal for sparkle, and a sharp sun specular adds
// glints. Output is linear — the pipeline tonemaps once in the final pass,
// exactly like standard.frag.

uniform samplerCube envMap;
uniform bool hasEnv;

uniform vec3 cameraLoc;
uniform vec3 sundir;       // direction toward the sun (normalized)
uniform vec3 sunlight;     // sun colour
uniform float time;

uniform vec3 deepColor;    // water body colour looking straight down
uniform vec3 shallowColor; // tint near crests / grazing
uniform float reflectivity;   // overall strength of the sky reflection (0..1)
uniform float fresnelPower;   // Fresnel falloff exponent (~5)
uniform float fresnelBias;    // minimum reflectivity looking straight down
uniform float sunGlitter;     // sun-glitter roughness: small = tight glint, large = broad path
uniform float specStrength;   // sun-glitter intensity (HDR; >1 blooms)
uniform float rippleScale;    // world units -> ripple frequency
uniform float rippleStrength; // how hard ripples bend the normal
uniform float rippleDetail;   // strength of the near-camera fine ripple octaves (breaks up "oily" close water)
uniform float reflectionBlur; // distance-based reflection softening (0 = mirror)

// distance fog, matching standard.frag so the sea melts into the horizon haze
uniform bool hasFog;
uniform vec3 fogColor;
uniform float fogNear;
uniform float fogFar;

// ship wake foam — a turbulent white trail painted along the path a moving
// vessel has carved. The CPU streams the recent path samples (Ocean._wake) in
// as a polyline; here we measure each fragment's distance to that line and lay
// down foam, brightest along the centre and fanning/fading toward the tail.
#define WAKE_MAX 48
uniform int   uWakeCount;          // number of valid samples in uWake (0 = off)
uniform vec4  uWake[WAKE_MAX];     // xy = world xz, z = strength 0..1, w = half-width
uniform vec3  uWakeFoamColor;      // foam tint (slightly >1 to bloom)
uniform float uWakeFoamIntensity;  // overall foam opacity
uniform float uWakeSparkle;        // sun sparkle on the spray (HDR; 0 = off)

// depth-based contact foam — white water wherever solid geometry breaks the
// surface (hull waterline, shoreline, rocks). A depth pre-pass packs the
// nearest opaque linear depth (the ocean excludes itself) into RGBA; we unpack
// it per pixel and foam where that geometry sits just under the water surface.
uniform bool      uHasContact;
uniform sampler2D uContactDepth;
uniform vec2      uContactRes;       // main framebuffer size, to map gl_FragCoord
uniform float     uContactNear;
uniform float     uContactFar;
uniform float     uContactDist;      // foam fades out this far *below* the surface (world Y units)
uniform vec3      uContactColor;
uniform float     uContactIntensity;
uniform mat4      uInvProjView;      // inverse projection·view, to unproject the solid to world

varying vec3 vWorldPos;
varying vec3 vNormal;
varying vec2 vWorldXZ;
varying float vCrest;

float hash(vec2 p) {
	p = fract(p * vec2(123.34, 456.21));
	p += dot(p, p + 45.32);
	return fract(p.x * p.y);
}

float valueNoise(vec2 p) {
	vec2 i = floor(p);
	vec2 f = fract(p);
	vec2 u = f * f * (3.0 - 2.0 * f);
	float a = hash(i);
	float b = hash(i + vec2(1.0, 0.0));
	float c = hash(i + vec2(0.0, 1.0));
	float d = hash(i + vec2(1.0, 1.0));
	return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

// gradient of the noise field, used to tilt the surface normal for fine ripples
vec2 noiseGrad(vec2 p) {
	float e = 0.35;
	float nx = valueNoise(p + vec2(e, 0.0)) - valueNoise(p - vec2(e, 0.0));
	float nz = valueNoise(p + vec2(0.0, e)) - valueNoise(p - vec2(0.0, e));
	return vec2(nx, nz);
}

vec3 proceduralSky(vec3 dir) {
	float t = clamp(dir.y * 0.5 + 0.5, 0.0, 1.0);
	vec3 horizon = vec3(0.70, 0.80, 0.92);
	vec3 zenith  = vec3(0.18, 0.34, 0.62);
	vec3 sky = mix(horizon, zenith, t);
	// a soft glow around the sun reflected off the water
	float sun = pow(max(dot(dir, sundir), 0.0), 80.0);
	return sky + sunlight * sun * 0.5;
}

// unpack the RGBA-packed linear depth written by attribmap.frag (packDepth).
float unpackDepth(vec4 enc) {
	return dot(enc, vec4(1.0, 1.0 / 255.0, 1.0 / 65025.0, 1.0 / 16581375.0));
}

// distance from point p to segment ab, with t = the closest-point parameter
// (0 at a .. 1 at b) so per-sample strength/width can be interpolated along it.
float segDist(vec2 p, vec2 a, vec2 b, out float t) {
	vec2 ab = b - a;
	float l2 = max(dot(ab, ab), 1.0e-4);
	t = clamp(dot(p - a, ab) / l2, 0.0, 1.0);
	return length(p - (a + ab * t));
}

// Foam coverage at world point P, walking the wake polyline. Returns 0..1.
// Per segment: distance gives a soft-edged band (bright centre -> clear edge),
// scaled by the sample's fading strength; we keep the strongest band hit.
float wakeFoam(vec2 P) {
	if (uWakeCount < 2) return 0.0;

	float foam = 0.0;
	for (int i = 0; i < WAKE_MAX - 1; i++) {
		if (i >= uWakeCount - 1) break;
		vec4 a = uWake[i];
		vec4 b = uWake[i + 1];
		float t;
		float d = segDist(P, a.xy, b.xy, t);
		float halfW = mix(a.w, b.w, t);
		float strength = mix(a.z, b.z, t);
		float band = 1.0 - smoothstep(halfW * 0.25, halfW, d);
		foam = max(foam, band * strength);
	}
	return foam;
}

void main(void) {
	vec3 V = normalize(cameraLoc - vWorldPos);
	float camDist = length(cameraLoc - vWorldPos);

	// Wave normal, perturbed by scrolling noise octaves for ripples. The two
	// coarse octaves run everywhere; two finer/faster octaves are mixed in only
	// near the camera (`nearDetail`). That is the cure for the "oily" near water:
	// up close a single coarse ripple scale leaves big smooth mirror blobs, so we
	// break the surface into many small facets that shatter the reflection into
	// choppy water — while the distance keeps just the coarse ripples, so the far
	// sea stays clean instead of aliasing into sparkle noise. All octaves scroll
	// on the same flow, so their frequency and speed stay tied to the actual swell.
	vec3 N = normalize(vNormal);
	vec2 base = vWorldXZ * rippleScale;
	float t = time * 6.0;
	float nearDetail = exp(-camDist * 0.02);   // 1 at the camera -> 0 far off
	vec2 g  = noiseGrad(base                + vec2(0.06,  0.03) * t);
	g      += noiseGrad(base * 2.3          - vec2(0.05,  0.08) * t) * 0.5;
	g      += noiseGrad(base * 5.1          + vec2(0.09, -0.07) * t) * (0.6 * rippleDetail * nearDetail);
	g      += noiseGrad(base * 11.7         - vec2(0.12,  0.10) * t) * (0.4 * rippleDetail * nearDetail);
	N = normalize(N + vec3(-g.x, 0.0, -g.y) * rippleStrength);

	// keep the normal facing the viewer (handles the underside / steep crests)
	if (dot(N, V) < 0.0) N = reflect(N, V);

	float ndv = max(dot(N, V), 0.0);

	// sky reflection
	vec3 R = reflect(-V, N);
	vec3 sky;
	if (hasEnv) {
		// Reflect the real environment cubemap directly — it carries full-sphere
		// HDR radiance (the sun disk, cloud detail, horizon haze), so the water
		// mirrors the actual sky and the reflected sun blooms through the HDR
		// pipeline. A mild distance/grazing mip bias softens far ripples so the
		// surface reads as glossy water rather than a chrome mirror, and stops
		// the high-frequency wave normals from aliasing into sparkle noise.
		float lod = reflectionBlur * (0.4 + 0.6 * (1.0 - ndv)) * (1.0 - exp(-camDist * 0.01));
		// Flip X to match the skybox's sampling convention (panorama.vert negates
		// texcoord.x, and standard.frag negates the reflection/refraction lookup the
		// same way), so the reflected sun and clouds line up left-right with the
		// visible sky instead of mirroring it.
		sky = textureCube(envMap, vec3(-R.x, R.y, R.z), lod).rgb;
	} else {
		// the procedural fallback only models the upper hemisphere, so fold rays
		// that dip below the horizon back up before sampling it.
		vec3 Rp = R;
		Rp.y = abs(Rp.y) * 0.85 + 0.02;
		sky = proceduralSky(Rp);
	}

	// Fresnel: more sky at grazing angles, more body colour looking down
	float fres = fresnelBias + (1.0 - fresnelBias) * pow(1.0 - ndv, fresnelPower);
	fres = clamp(fres * reflectivity, 0.0, 1.0);

	// water body: a touch lighter toward the crests
	vec3 body = mix(deepColor, shallowColor, smoothstep(0.55, 1.0, vCrest));

	vec3 color = mix(body, sky, fres);

	// --- sun glitter: the bright "sun road" a low sun lays across the water.
	// A GGX specular lobe catches the many wave facets between the eye and the
	// sun; `sunGlitter` widens it from a hard glint into a shimmering path, and
	// the result is HDR-bright so it blooms. It fades out once the sun drops
	// below the horizon. Strongest near the horizon under the sun, breaking up
	// into sparkle over the nearer swell.
	vec3 H = normalize(V + sundir);
	float NoH = max(dot(N, H), 0.0);
	float a = max(sunGlitter, 0.02);
	float a2 = a * a;
	float dterm = NoH * NoH * (a2 - 1.0) + 1.0;
	float ggx = a2 / (3.14159265 * dterm * dterm);
	float sunUp = smoothstep(-0.05, 0.15, sundir.y);
	color += sunlight * ggx * specStrength * sunUp;

	// --- ship wake foam: turbulent white water churned up along the vessel's
	// path. The coverage band comes from the wake polyline; two scrolling noise
	// octaves break it into froth and boiling streaks so it reads as churn
	// rather than a painted stripe. Laid over the water before fog so the far
	// trail melts into the haze with the rest of the sea.
	float wakeF = 0.0;
	if (uWakeCount >= 2) {
		wakeF = wakeFoam(vWorldXZ);
		if (wakeF > 0.0) {
			vec2 fp = vWorldXZ * 0.18;
			float n1 = valueNoise(fp + vec2(time * 0.6, -time * 0.4));
			float n2 = valueNoise(fp * 2.7 - vec2(time * 0.9, time * 0.7));
			float churn = mix(0.55, 1.15, n1) * mix(0.7, 1.1, n2);
			wakeF = clamp(wakeF * churn * uWakeFoamIntensity, 0.0, 1.0);
			color = mix(color, uWakeFoamColor, wakeF);
		}
	}

	// --- contact foam: white water where solid geometry breaks the surface
	// (hull waterline, beach, rock). Foam by how far the solid behind this pixel
	// sits *below* the water surface (world Y) — a thin waterline band that
	// excludes the deep submerged hull, props and rudder, and converges at the
	// stem (no forward smear). The solid's world position is reconstructed from
	// the pre-pass depth, which is 32-bit packed and so precise: the water
	// fragment's own gl_FragCoord.z is NOT used, because the 16-bit depth buffer
	// is only ~±5u accurate this far out and smeared foam over the whole hull.
	float contactF = 0.0;
	if (uHasContact) {
		vec2 uv = gl_FragCoord.xy / uContactRes;
		float sceneD = unpackDepth(texture2D(uContactDepth, uv));         // 0..1 linear
		if (sceneD < 0.999) {                                            // skip empty sky (far)
			float vz = sceneD * (uContactFar - uContactNear) + uContactNear;   // solid view distance
			vec2 ndc = uv * 2.0 - 1.0;
			float ndcz = (uContactFar + uContactNear) / (uContactFar - uContactNear)
			           - (2.0 * uContactFar * uContactNear) / ((uContactFar - uContactNear) * vz);
			vec4 clip = uInvProjView * vec4(ndc, ndcz, 1.0);
			vec3 solidPos = clip.xyz / clip.w;
			float vgap = vWorldPos.y - solidPos.y;                          // >0 = solid below surface
			float band = (1.0 - smoothstep(0.0, uContactDist, vgap))
			           * smoothstep(0.0, uContactDist * 0.2, vgap);
			float cn = valueNoise(vWorldXZ * 0.6 + vec2(time * 0.4, -time * 0.5));
			contactF = clamp(band * mix(0.6, 1.25, cn) * uContactIntensity, 0.0, 1.0);
			if (contactF > 0.0) color = mix(color, uContactColor, contactF);
		}
	}

	// Sun sparkle across all the churned-up foam/spray: thousands of tiny
	// droplets each flash as they catch the sun, so we scatter sharp,
	// fast-twinkling HDR glints over the foam. Two high-frequency noise fields
	// scroll against each other and are raised to a high power to leave only
	// sparse pinpoints; density follows the foam and they only fire when the sun
	// is up, biased toward its specular direction. HDR-bright so the bloom pass
	// makes them glitter.
	float foamAll = max(wakeF, contactF);
	if (uWakeSparkle > 0.0 && sunUp > 0.0 && foamAll > 0.0) {
		vec2 sp = vWorldXZ * 1.7;
		float tw = valueNoise(sp + vec2(time * 2.3, -time * 1.7))
		         * valueNoise(sp * 1.9 - vec2(time * 3.1, time * 2.2));
		tw = pow(tw, 6.0);
		float toSun = 0.5 + 0.5 * pow(NoH, 8.0);
		color += sunlight * (tw * foamAll * uWakeSparkle * sunUp * toSun);
	}

	// distance fog toward the horizon
	if (hasFog) {
		float fogAmount = clamp((camDist - fogNear) / max(fogFar - fogNear, 1.0e-4), 0.0, 1.0);
		color = mix(color, fogColor, fogAmount);
	}

	gl_FragColor = vec4(color, 1.0);
}
