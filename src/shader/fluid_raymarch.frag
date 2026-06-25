#version 300 es

// Fluid — render (raymarch) fragment stage. STAGE 2: a deliberately simple
// emission + absorption march, just enough to SEE that the simulation is alive
// and behaving like a plume. Stage 3 replaces this with sun lighting, a
// self-shadow march, and blackbody fire colour.
//
// For each pixel we rebuild the world ray, clip it to the simulation's world-
// space box, and step through the density volume front-to-back accumulating
// grey smoke (absorption) plus a warm glow from temperature. Output is
// premultiplied (rgb = accumulated radiance, a = 1 − transmittance) so the
// composite pass blends it over the scene with (ONE, ONE_MINUS_SRC_ALPHA).
precision highp float;
precision highp sampler3D;

in vec2 vNdc;

uniform mat4 invViewProj;
uniform vec3 cameraPos;
uniform vec3 boxMin;             // simulation box, world space
uniform vec3 boxMax;
uniform sampler3D densityTex;    // R = density, G = temperature
uniform float densityScale;      // multiplies stored density into optical depth
uniform float emissionStrength;  // warm glow from temperature
uniform vec3 smokeColor;
uniform int steps;

out vec4 fragColor;

// slab method: returns (tNear, tFar) of the ray vs the box; tFar < tNear = miss
vec2 intersectBox(vec3 ro, vec3 rd, vec3 lo, vec3 hi) {
	vec3 inv = 1.0 / rd;
	vec3 t0 = (lo - ro) * inv;
	vec3 t1 = (hi - ro) * inv;
	vec3 tmin = min(t0, t1);
	vec3 tmax = max(t0, t1);
	float tn = max(max(tmin.x, tmin.y), tmin.z);
	float tf = min(min(tmax.x, tmax.y), tmax.z);
	return vec2(tn, tf);
}

void main(void) {
	// reconstruct the world-space view ray from the pixel NDC
	vec4 nearH = invViewProj * vec4(vNdc, -1.0, 1.0);
	vec4 farH  = invViewProj * vec4(vNdc,  1.0, 1.0);
	vec3 p0 = nearH.xyz / nearH.w;
	vec3 p1 = farH.xyz / farH.w;
	vec3 rd = normalize(p1 - p0);
	vec3 ro = cameraPos;

	vec2 t = intersectBox(ro, rd, boxMin, boxMax);
	float tNear = max(t.x, 0.0);
	if (t.y <= tNear) { fragColor = vec4(0.0); return; }

	float stepLen = (t.y - tNear) / float(steps);
	vec3 invSize = 1.0 / (boxMax - boxMin);

	float transmittance = 1.0;
	vec3 accum = vec3(0.0);

	for (int i = 0; i < 256; i++) {
		if (i >= steps) break;
		float tt = tNear + (float(i) + 0.5) * stepLen;
		vec3 wp = ro + rd * tt;
		vec3 uvw = (wp - boxMin) * invSize;

		vec2 dc = texture(densityTex, uvw).rg;
		float density = dc.r * densityScale;
		if (density > 0.001) {
			float a = 1.0 - exp(-density * stepLen);
			vec3 emit = emissionStrength * vec3(1.0, 0.5, 0.2) * dc.g;
			vec3 col = smokeColor * 0.2 + emit;
			accum += transmittance * a * col;
			transmittance *= (1.0 - a);
			if (transmittance < 0.01) break;
		}
	}

	fragColor = vec4(accum, 1.0 - transmittance);
}
