
precision mediump float;

varying vec4 color;

uniform float opacity;
uniform float streakWidth;  // half-width of the streak as a fraction of the sprite (0..0.5)
uniform float slant;        // horizontal shear, slants the streak for a wind effect

void main(void) {
	// gl_PointCoord: (0,0) top-left .. (1,1) bottom-left of the point sprite
	vec2 c = gl_PointCoord - vec2(0.5);

	// shear horizontally along the vertical axis to slant the streak
	float x = c.x - slant * c.y;

	// horizontal profile: solid at the centre line, fading out to the edges
	float h = 1.0 - smoothstep(0.0, max(streakWidth, 0.001), abs(x));

	// vertical profile: soft rounded ends top and bottom
	float v = 1.0 - smoothstep(0.34, 0.5, abs(c.y));

	// brighter towards the leading (bottom) tip of the falling drop
	float head = mix(0.45, 1.0, c.y + 0.5);

	float alpha = h * v * head * color.a * opacity;

	if (alpha < 0.01) discard;

	gl_FragColor = vec4(color.rgb, alpha);
}
