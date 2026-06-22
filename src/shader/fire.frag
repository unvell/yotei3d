
precision mediump float;

varying vec4 color;

uniform float opacity;

void main(void) {
	// soft round sprite with a hot, bright core
	vec2 c = gl_PointCoord - vec2(0.5);
	float d = length(c) * 2.0;
	if (d > 1.0) discard;

	// sharp falloff concentrates the glow in the centre; overlapping embers
	// build up additively into bright cores that the bloom pass blooms out.
	float a = pow(1.0 - d, 1.8);

	// additive blend (set in FireShader): the colour already carries the
	// per-ember life fade, so alpha only shapes the soft sprite edge.
	gl_FragColor = vec4(color.rgb, a * opacity);
}
