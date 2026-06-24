
// Volumetric clouds — raymarch fragment stage.
//
// For each pixel we reconstruct the world-space view ray and march the slice of
// it that passes through a flat cloud layer (a slab between cloudBaseY and
// cloudTopY). Cloud density is evaluated procedurally from hash-based 3D value
// noise (no 3D textures — this stays within GLSL ES 1.00 / the engine's WebGL
// feature set), shaped by a coverage threshold and a vertical profile, then
// eroded by higher-frequency detail. Lighting is single-scattering: a short
// march toward the sun gives Beer's-law self-shadowing, combined with a
// Henyey-Greenstein phase (forward silver lining), a powder term for the dark
// edges, and a sky/ground ambient fill — driven by the (dynamic) sky's sun.
//
// Output is PREMULTIPLIED (in-scattered radiance, coverage alpha), composited
// over the scene later with blend (ONE, ONE_MINUS_SRC_ALPHA). Rendered at
// reduced resolution in a pre-pass because each step is a multi-octave FBM.

precision highp float;

varying vec2 vNdc;

uniform mat4 invViewProj;     // clip -> world
uniform vec3 cameraPos;
uniform vec3 sunDir;          // world-space direction toward the sun (normalized)
uniform vec3 sunColor;        // sun radiance (driven by the dynamic sky's sun tint)
uniform vec3 ambientColor;    // sky fill (cloud tops)
uniform vec3 groundColor;     // bounce fill (cloud bottoms)

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

float hash13(vec3 p) {
	p = fract(p * 0.1031);
	p += dot(p, p.zyx + 31.32);
	return fract((p.x + p.y) * p.z);
}

// 3D value noise (trilinear interpolation of hashed lattice corners)
float vnoise(vec3 x) {
	vec3 i = floor(x);
	vec3 f = fract(x);
	f = f * f * (3.0 - 2.0 * f);
	float n000 = hash13(i + vec3(0.0, 0.0, 0.0));
	float n100 = hash13(i + vec3(1.0, 0.0, 0.0));
	float n010 = hash13(i + vec3(0.0, 1.0, 0.0));
	float n110 = hash13(i + vec3(1.0, 1.0, 0.0));
	float n001 = hash13(i + vec3(0.0, 0.0, 1.0));
	float n101 = hash13(i + vec3(1.0, 0.0, 1.0));
	float n011 = hash13(i + vec3(0.0, 1.0, 1.0));
	float n111 = hash13(i + vec3(1.0, 1.0, 1.0));
	return mix(mix(mix(n000, n100, f.x), mix(n010, n110, f.x), f.y),
	           mix(mix(n001, n101, f.x), mix(n011, n111, f.x), f.y), f.z);
}

float fbm(vec3 p) {
	float a = 0.5, s = 0.0;
	for (int i = 0; i < 5; i++) {
		s += a * vnoise(p);
		p *= 2.02;
		a *= 0.5;
	}
	return s;
}

// shaped cloud density at a world point, in [0, 1]
float cloudDensity(vec3 p) {
	float h = (p.y - cloudBaseY) / max(cloudTopY - cloudBaseY, 1.0);
	if (h < 0.0 || h > 1.0) return 0.0;

	vec3 wind = vec3(windDir.x, 0.0, windDir.y) * time;
	vec3 q = (p + wind) * baseFreq;

	float base = fbm(q);
	float d = base - (1.0 - coverage);   // coverage threshold
	if (d <= 0.0) return 0.0;

	// vertical profile: rounded base, wispy eroded top
	float profile = smoothstep(0.0, 0.2, h) * (1.0 - smoothstep(0.5, 1.0, h));
	d *= profile;

	// erode edges with higher-frequency detail (more toward the top)
	float detail = fbm(q * 3.0 + 19.0);
	d -= detail * detailScale * smoothstep(0.2, 1.0, h);

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

	// the cloud layer sits overhead; only upward rays cross it
	if (rd.y <= 0.002) discard;

	// intersect the ray with the cloud slab in Y
	float t0 = (cloudBaseY - ro.y) / rd.y;
	float t1 = (cloudTopY  - ro.y) / rd.y;
	float tEnter = max(min(t0, t1), 0.0);
	float tExit  = min(max(t0, t1), maxDist);
	if (tExit <= tEnter) discard;

	float stepLen = (tExit - tEnter) / float(steps);

	// interleaved-gradient-noise dither to break slice banding
	float ign = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
	float t = tEnter + stepLen * ign;

	float phase = hgPhase(dot(rd, sunDir), phaseG);

	float transmittance = 1.0;
	vec3 scattered = vec3(0.0);

	for (int i = 0; i < 128; i++) {
		if (i >= steps) break;
		if (transmittance < 0.02) break;

		vec3 p = ro + rd * t;
		float d = cloudDensity(p);

		if (d > 0.002) {
			// short march toward the sun for self-shadowing (Beer's law)
			float lstep = (cloudTopY - cloudBaseY) / float(lightSteps) * 0.5;
			float ld = 0.0;
			for (int j = 0; j < 8; j++) {
				if (j >= lightSteps) break;
				ld += cloudDensity(p + sunDir * (lstep * (float(j) + 0.5)));
			}
			float lightTransmit = exp(-ld * lstep * extinction * sunAbsorption);

			float powder = 1.0 - exp(-d * 3.0);          // darken thin edges
			float h = clamp((p.y - cloudBaseY) / max(cloudTopY - cloudBaseY, 1.0), 0.0, 1.0);
			vec3 sunLit = sunColor * (lightTransmit * phase * powder);
			vec3 ambient = mix(groundColor, ambientColor, h);
			vec3 lum = sunLit + ambient;

			float sigma = d * extinction * stepLen;
			float st = exp(-sigma);
			scattered += transmittance * (1.0 - st) * lum;
			transmittance *= st;
		}

		t += stepLen;
	}

	float alpha = 1.0 - transmittance;
	alpha *= smoothstep(0.0, 0.05, rd.y);   // soft fade toward the horizon
	if (alpha < 0.002) discard;

	gl_FragColor = vec4(scattered, alpha);  // premultiplied
}
