
precision mediump float;

varying vec2 vWorldXZ;
varying vec2 vLocal;

uniform vec3 fogColor;
uniform float opacity;
uniform float density;     // coverage, 0 (sparse) .. 1 (solid)
uniform float noiseScale;  // world units -> noise frequency
uniform vec2 flow1;        // animated offset for the coarse noise layer
uniform vec2 flow2;        // animated offset for the fine noise layer

float hash(vec2 p) {
	p = fract(p * vec2(123.34, 456.21));
	p += dot(p, p + 45.32);
	return fract(p.x * p.y);
}

float valueNoise(vec2 p) {
	vec2 i = floor(p);
	vec2 f = fract(p);
	vec2 u = f * f * (3.0 - 2.0 * f);   // smootherstep interpolation
	float a = hash(i);
	float b = hash(i + vec2(1.0, 0.0));
	float c = hash(i + vec2(0.0, 1.0));
	float d = hash(i + vec2(1.0, 1.0));
	return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

float fbm(vec2 p) {
	float v = 0.0;
	float amp = 0.5;
	for (int i = 0; i < 5; i++) {
		v += amp * valueNoise(p);
		p *= 2.0;
		amp *= 0.5;
	}
	return v;
}

void main(void) {
	vec2 base = vWorldXZ * noiseScale;

	// two drifting layers give a churning, non-rigid flow
	float n = fbm(base + flow1) * 0.6 + fbm(base * 1.7 + flow2) * 0.4;

	// shape the noise into soft fog patches; higher density => more coverage
	float d = smoothstep(1.0 - density, 1.0, n);

	// radial fade so the plane borders are never visible
	float edge = 1.0 - smoothstep(0.30, 0.5, length(vLocal));

	float alpha = d * edge * opacity;
	if (alpha < 0.004) discard;

	gl_FragColor = vec4(fogColor, alpha);
}
