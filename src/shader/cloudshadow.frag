
precision mediump float;

varying vec2 vLocal;

uniform float opacity;      // per-object strength (cluster fade * global * fade-in)
uniform vec3 shadowColor;   // dark tint laid over the ground
uniform float seed;         // per-cluster, varies the blob outline

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
	// soft, irregular dark blob: a radial falloff whose edge is pushed in and
	// out by fbm so the cast shadow isn't a clean circle
	float r = length(vLocal);
	if (r > 1.25) discard;

	float n = fbm(vLocal * 1.7 + seed * 19.0);
	float a = smoothstep(1.0, 0.2, r + (n - 0.5) * 0.55);

	gl_FragColor = vec4(shadowColor, a * opacity);
}
