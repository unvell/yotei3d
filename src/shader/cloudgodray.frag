
// Cloud god rays — fragment stage (ray-marched volumetric scattering).
//
// For each sky pixel we reconstruct the world-space view ray and march it,
// sampling the sun-POV cloud transmittance map at every step. The light that
// survives the clouds to reach each air sample is scattered toward the eye,
// weighted by a Henyey-Greenstein phase function (forward-peaked toward the
// sun). Integrating along the ray yields true crepuscular rays: bright where
// the view passes through sunlit gaps, dark in the columns the clouds shadow.
//
// The result is additive HDR light, composited into the scene buffer so it
// blooms and tonemaps with everything else.
precision highp float;

varying vec2 vNdc;

uniform mat4 invViewProj;        // clip -> world
uniform vec3 cameraPos;
uniform vec3 sunDir;             // world-space direction toward the sun (normalized)
uniform vec3 sunColor;

uniform mat4 cloudShadowMatrix;  // world -> light clip (sun's ortho view)
uniform sampler2D cloudShadowMap;
uniform float cloudDensity;      // optical-density scale: transmittance = exp(-density * tau)
uniform float cloudBaseY;        // altitude of the cloud layer's underside
uniform float cloudTopY;         // altitude of the cloud layer's top

uniform float intensity;         // overall shaft brightness
uniform int   steps;             // ray-march samples
uniform float maxDist;           // how far along the view ray to march (world units)
uniform float phaseG;            // Henyey-Greenstein anisotropy (0..1, forward)
uniform float scatter;           // per-step in-scatter weight
uniform float startJitter;       // 0..1 dither of the first sample to break banding

#define PI 3.14159265359

float hgPhase(float cosT, float g) {
	float g2 = g * g;
	return (1.0 - g2) / pow(max(1.0 + g2 - 2.0 * g * cosT, 1.0e-4), 1.5);
}

float sampleTransmittance(vec3 wp) {
	vec4 lc = cloudShadowMatrix * vec4(wp, 1.0);
	vec2 uv = (lc.xy / lc.w) * 0.5 + 0.5;
	// outside the cloud footprint there is no occluder data -> fully lit
	if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) return 1.0;
	float tau = texture2D(cloudShadowMap, uv).r;
	// the 2D map projects the whole cloud column, so on its own it would shadow
	// air samples that actually sit ABOVE the layer (where the sun is already
	// unobstructed). Fade the optical depth out across the layer: a sample is
	// fully shadowed only once it is below the cloud base, fully lit above the
	// top. This confines the shadow structure to the sub-cloud air, where the
	// crepuscular shafts physically form, so they read as crisp beams.
	float below = smoothstep(cloudTopY, cloudBaseY, wp.y);
	return exp(-cloudDensity * tau * below);
}

void main(void) {
	// reconstruct the world-space view ray for this pixel
	vec4 nearW = invViewProj * vec4(vNdc, -1.0, 1.0);
	vec4 farW  = invViewProj * vec4(vNdc,  1.0, 1.0);
	nearW /= nearW.w;
	farW  /= farW.w;
	vec3 ro = cameraPos;
	vec3 rd = normalize(farW.xyz - nearW.xyz);

	int N = steps;
	float fN = float(N);

	// Confine the march to the sub-cloud haze: from the camera up to where the
	// view ray reaches the cloud base. Crepuscular shafts are the cloud shadows
	// cast into that lit air; integrating the bright clear sky ABOVE the layer
	// would only wash them out. Rays that never reach the layer (looking level
	// or down) just march the full distance.
	float tEnd = maxDist;
	if (rd.y > 0.001) {
		float tBase = (cloudBaseY - ro.y) / rd.y;
		if (tBase > 0.0) tEnd = min(maxDist, tBase);
	}
	tEnd = max(tEnd, 1.0);
	float stepLen = tEnd / fN;

	// interleaved-gradient-noise dither on the first sample position
	float ign = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
	float t = stepLen * (0.5 + (ign - 0.5) * startJitter);

	float phase = hgPhase(dot(rd, sunDir), phaseG);

	float acc = 0.0;
	for (int i = 0; i < 256; i++) {
		if (i >= N) break;
		acc += sampleTransmittance(ro + rd * t);
		t += stepLen;
	}

	// average sub-cloud transmittance (lit gaps -> 1, shadowed columns -> ~0)
	// modulated by the forward-scatter phase toward the sun
	float inscatter = (acc / fN) * phase * scatter * intensity;

	gl_FragColor = vec4(sunColor * inscatter, 1.0);
}
