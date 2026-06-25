#version 300 es

// Fluid — render (raymarch) fragment stage. STAGE 3: single-scattering smoke
// with a sun-ward self-shadow march, plus blackbody fire emission driven by the
// simulation's temperature channel.
//
// For every pixel we rebuild the world ray, clip it to the simulation box, and
// step through the density volume front-to-back. At each sample we:
//   * march a few steps TOWARD THE SUN, accumulating density, to get how much
//     sunlight survives to this point (self-shadowing → depth and form);
//   * shade the smoke = albedo * (shadowed sun * phase + sky ambient);
//   * add HDR fire emission from temperature (hot core = white/yellow, cooler =
//     orange/red). Over-bright so it feeds the scene's bloom pass.
// Output is premultiplied (rgb = radiance, a = 1 − transmittance) for the
// (ONE, ONE_MINUS_SRC_ALPHA) composite over the scene.
precision highp float;
precision highp sampler3D;

in vec2 vNdc;

uniform mat4 invViewProj;
uniform vec3 cameraPos;
uniform vec3 boxMin;
uniform vec3 boxMax;
uniform sampler3D densityTex;    // R = density, G = temperature

uniform float densityScale;      // extinction per unit stored density
uniform int steps;               // view-ray march steps
uniform int lightSteps;          // sun-ward march steps
uniform float lightStepLen;      // world length of one sun-march step
uniform float shadowDensity;     // sun absorption coefficient
uniform vec3 sunDir;             // unit vector TOWARD the sun (world)
uniform vec3 sunColor;           // HDR sun radiance
uniform vec3 ambientColor;       // sky fill (lights the shadowed side)
uniform vec3 smokeColor;         // smoke albedo
uniform float phaseG;            // forward-scatter amount (silver lining)
uniform float fireGain;          // emission strength from temperature (0 = pure smoke)
uniform float fireTempScale;     // temperature mapped to the hottest colour

out vec4 fragColor;

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

// temperature -> fire colour ramp (cheap blackbody-ish): deep red -> orange ->
// yellow -> near white as it gets hotter.
vec3 fireColor(float x) {
	x = clamp(x, 0.0, 1.0);
	vec3 c = mix(vec3(0.6, 0.05, 0.0), vec3(1.0, 0.35, 0.06), smoothstep(0.0, 0.45, x));
	c = mix(c, vec3(1.0, 0.72, 0.25), smoothstep(0.4, 0.72, x));
	c = mix(c, vec3(1.0, 0.95, 0.82), smoothstep(0.72, 1.0, x));
	return c;
}

void main(void) {
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

	// cheap forward-scatter: brighter when looking toward the sun (silver lining)
	float phase = 1.0 + phaseG * dot(rd, sunDir);

	float transmittance = 1.0;
	vec3 accum = vec3(0.0);

	for (int i = 0; i < 256; i++) {
		if (i >= steps) break;
		float tt = tNear + (float(i) + 0.5) * stepLen;
		vec3 wp = ro + rd * tt;
		vec3 uvw = (wp - boxMin) * invSize;

		vec4 dc = texture(densityTex, uvw);
		float density = dc.r * densityScale;
		if (density > 0.001) {
			// sun-ward self-shadow march: how much sunlight reaches this cell
			float shadow = 1.0;
			for (int j = 0; j < 32; j++) {
				if (j >= lightSteps) break;
				vec3 lp = wp + sunDir * lightStepLen * (float(j) + 0.5);
				float ld = texture(densityTex, (lp - boxMin) * invSize).r * densityScale;
				shadow *= exp(-ld * lightStepLen * shadowDensity);
				if (shadow < 0.01) break;
			}

			vec3 lit = smokeColor * (sunColor * shadow * phase + ambientColor);

			// HDR fire emission from temperature
			float ht = dc.g / fireTempScale;
			vec3 fire = fireGain * fireColor(ht) * ht * ht;

			float a = 1.0 - exp(-density * stepLen);
			accum += transmittance * a * (lit + fire);
			transmittance *= (1.0 - a);
			if (transmittance < 0.01) break;
		}
	}

	fragColor = vec4(accum, 1.0 - transmittance);
}
