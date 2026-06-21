
precision mediump float;

varying vec4 color;
varying float vSeed;

uniform float opacity;

// cheap value noise + fbm to give each puff a soft, fluffy edge
float hash(vec2 p) {
	return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float vnoise(vec2 p) {
	vec2 i = floor(p);
	vec2 f = fract(p);
	vec2 u = f * f * (3.0 - 2.0 * f);
	return mix(mix(hash(i),                hash(i + vec2(1.0, 0.0)), u.x),
	           mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}

float fbm(vec2 p) {
	float v = 0.0, a = 0.5;
	for (int k = 0; k < 4; k++) {
		v += a * vnoise(p);
		p *= 2.02;
		a *= 0.5;
	}
	return v;
}

void main(void) {
	// soft round base
	vec2 c = gl_PointCoord - vec2(0.5);
	float d = length(c) * 2.0;
	if (d > 1.0) discard;

	float base = 1.0 - d;

	// fluffy modulation, offset per-puff so neighbouring puffs differ
	vec2 np = gl_PointCoord * 3.0 + vSeed * 53.0;
	float n = fbm(np);

	float a = base * (0.72 + 0.55 * n);
	a = clamp(a, 0.0, 1.0);
	a = pow(a, 1.25);

	gl_FragColor = vec4(color.rgb, a * opacity);
}
