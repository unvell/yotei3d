
// Cloud transmittance map — fragment stage.
//
// Each puff contributes its soft, lumpy opacity as *optical density* (tau),
// accumulated ADDITIVELY (blendFunc ONE,ONE) into the map. The map therefore
// stores, per light-space texel, the total cloud thickness the sun must pass
// through; a sampler later recovers transmittance as exp(-density * tau).
//
// The silhouette math (sphere falloff + fbm lumps) matches cloud.frag so the
// shadow footprint lines up with the visible cloud puffs.
precision mediump float;

varying float vSeed;
varying float vFade;

uniform float opacity;       // the cloud layer's live opacity (fade-in aware)
uniform float puffDensity;   // optical density contributed per unit puff opacity

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
	vec2 c = gl_PointCoord * 2.0 - 1.0;
	float r2 = dot(c, c);
	if (r2 > 1.0) discard;
	float r = sqrt(r2);

	// lumpy silhouette, identical to the cloud shader
	float lumps = fbm(gl_PointCoord * 3.0 + vSeed * 53.0);
	float edge = r + (lumps - 0.5) * 0.7;
	float a = smoothstep(1.0, 0.35, edge);

	a = clamp(a, 0.0, 1.0) * vFade * opacity;

	float d = a * puffDensity;
	gl_FragColor = vec4(d, d, d, d);
}
