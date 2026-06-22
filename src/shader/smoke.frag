
precision mediump float;

varying float vAlpha;

uniform vec3 color;     // grey smoke tint
uniform float opacity;  // overall smoke density

void main(void) {
	// very soft round puff
	vec2 c = gl_PointCoord - vec2(0.5);
	float d = length(c) * 2.0;
	if (d > 1.0) discard;

	// gentle edge so overlapping puffs read as a continuous, wispy column
	float a = pow(1.0 - d, 1.3);

	// straight alpha blend (set in SmokeShader): per-puff life fade in vAlpha
	gl_FragColor = vec4(color, a * vAlpha * opacity);
}
