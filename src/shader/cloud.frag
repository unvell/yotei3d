
precision mediump float;

varying vec4 color;
varying float vSeed;
varying float vFade;

uniform float opacity;

// cheap value noise + fbm to give each puff a soft, lumpy edge
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
	// treat the sprite as a little sphere so every puff reads as a rounded,
	// self-shaded lump — the billowy "cauliflower" look of real cumulus
	vec2 c = gl_PointCoord * 2.0 - 1.0;
	float r2 = dot(c, c);
	if (r2 > 1.0) discard;
	float r = sqrt(r2);
	float z = sqrt(1.0 - r2);

	// irregular silhouette: displace the soft edge with fbm so the outline is
	// lumpy (not a clean circle), while keeping a solid opaque core so the
	// cloud body stays dense and fluffy (no thin/wispy look, no crisp bubbles).
	float lumps = fbm(gl_PointCoord * 3.0 + vSeed * 53.0);
	float edge = r + (lumps - 0.5) * 0.7;
	float a = smoothstep(1.0, 0.35, edge);

	// gentle volumetric shading from an upper, sunlit direction. keep the
	// contrast modest and the normal fairly flat: a strong per-puff sphere
	// shade darkens each puff's rim, and that dark rim is exactly what showed
	// up as a faint circular arc where it overlapped a brighter neighbour.
	vec3 normal = normalize(vec3(c.x, -c.y, z * 1.1));
	vec3 L = normalize(vec3(-0.3, 0.58, 0.65));
	float diff = dot(normal, L) * 0.5 + 0.5;
	float shade = mix(0.84, 1.05, diff);

	a = clamp(a, 0.0, 1.0) * vFade;

	gl_FragColor = vec4(color.rgb * shade, a * opacity);
}
