
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
uniform float shininess;      // sun specular exponent (higher = tighter glint)
uniform float specStrength;   // sun specular intensity
uniform float rippleScale;    // world units -> ripple frequency
uniform float rippleStrength; // how hard ripples bend the normal

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

	// sky reflection
	vec3 R = reflect(-V, N);
	R.y = abs(R.y) * 0.85 + 0.02;   // bias rays upward so we never sample the void below
	vec3 sky = hasEnv ? textureCube(envMap, R).rgb : proceduralSky(R);

	// Fresnel: more sky at grazing angles, more body colour looking down
	float ndv = max(dot(N, V), 0.0);
	float fres = fresnelBias + (1.0 - fresnelBias) * pow(1.0 - ndv, fresnelPower);
	fres = clamp(fres * reflectivity, 0.0, 1.0);

	// water body: a touch lighter toward the crests
	vec3 body = mix(deepColor, shallowColor, smoothstep(0.55, 1.0, vCrest));

	vec3 color = mix(body, sky, fres);

	// sharp sun glint
	vec3 H = normalize(V + sundir);
	float spec = pow(max(dot(N, H), 0.0), shininess) * specStrength;
	color += sunlight * spec;

	// distance fog toward the horizon
	if (hasFog) {
		float fogDist = length(cameraLoc - vWorldPos);
		float fogAmount = clamp((fogDist - fogNear) / max(fogFar - fogNear, 1.0e-4), 0.0, 1.0);
		color = mix(color, fogColor, fogAmount);
	}

	gl_FragColor = vec4(color, 1.0);
}
