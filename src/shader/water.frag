
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
uniform float reflectionBlur; // distance-based reflection softening (0 = mirror)

// distance fog, matching standard.frag so the sea melts into the horizon haze
uniform bool hasFog;
uniform vec3 fogColor;
uniform float fogNear;
uniform float fogFar;

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

void main(void) {
	vec3 V = normalize(cameraLoc - vWorldPos);

	// base wave normal, perturbed by two scrolling noise layers for ripples
	vec3 N = normalize(vNormal);
	vec2 flow1 = vWorldXZ * rippleScale + vec2(0.06, 0.03) * time * 6.0;
	vec2 flow2 = vWorldXZ * rippleScale * 2.3 - vec2(0.05, 0.08) * time * 6.0;
	vec2 g = noiseGrad(flow1) + noiseGrad(flow2) * 0.5;
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
		float dist = length(cameraLoc - vWorldPos);
		float lod = reflectionBlur * (0.4 + 0.6 * (1.0 - ndv)) * (1.0 - exp(-dist * 0.01));
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

	// distance fog toward the horizon
	if (hasFog) {
		float fogDist = length(cameraLoc - vWorldPos);
		float fogAmount = clamp((fogDist - fogNear) / max(fogFar - fogNear, 1.0e-4), 0.0, 1.0);
		color = mix(color, fogColor, fogAmount);
	}

	gl_FragColor = vec4(color, 1.0);
}
