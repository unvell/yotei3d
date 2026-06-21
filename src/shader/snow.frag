
precision mediump float;

varying vec4 color;

uniform float opacity;

void main(void) {
	// soft, round snowflake
	vec2 c = gl_PointCoord - vec2(0.5);
	float d = length(c) * 2.0;
	if (d > 1.0) discard;

	// fuzzy falloff so flakes look soft rather than hard dots
	float a = pow(1.0 - d, 1.4);

	gl_FragColor = vec4(color.rgb, a * color.a * opacity);
}
