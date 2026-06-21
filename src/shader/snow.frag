
precision mediump float;

varying vec4 color;
varying float vDist;

uniform float opacity;
uniform float focusDist;   // flakes closer than this start to blur
uniform float focusRange;  // distance over which the blur ramps in

void main(void) {
	// soft, round snowflake
	vec2 c = gl_PointCoord - vec2(0.5);
	float d = length(c) * 2.0;
	if (d > 1.0) discard;

	// near flakes go out of focus: softer edge + lower alpha (bokeh-like)
	float blur = clamp((focusDist - vDist) / max(focusRange, 0.001), 0.0, 1.0);

	float power = mix(1.4, 0.45, blur);   // crisp when far, very soft when near
	float a = pow(1.0 - d, power);
	a *= mix(1.0, 0.45, blur);            // near blobs are fainter / translucent

	gl_FragColor = vec4(color.rgb, a * color.a * opacity);
}
