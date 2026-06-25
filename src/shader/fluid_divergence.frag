#version 300 es

// Fluid — DIVERGENCE.
//
// The projection step (next) needs to know how much the velocity field is
// "creating or destroying" fluid at each cell — its divergence. A central
// difference of the velocity's own components across the 6 face-neighbors gives
// it. A divergence-free (incompressible) field has zero here everywhere; the
// pressure solve drives it there.
precision highp float;
precision highp sampler3D;

uniform sampler3D velTex;
uniform vec3 uN;
uniform float zLayer;

out vec4 fragColor;

void main(void) {
	vec3 P = vec3(gl_FragCoord.xy, zLayer + 0.5);

	float l = texture(velTex, (P - vec3(1.0, 0.0, 0.0)) / uN).x;
	float r = texture(velTex, (P + vec3(1.0, 0.0, 0.0)) / uN).x;
	float d = texture(velTex, (P - vec3(0.0, 1.0, 0.0)) / uN).y;
	float u = texture(velTex, (P + vec3(0.0, 1.0, 0.0)) / uN).y;
	float b = texture(velTex, (P - vec3(0.0, 0.0, 1.0)) / uN).z;
	float f = texture(velTex, (P + vec3(0.0, 0.0, 1.0)) / uN).z;

	// dx = 1 cell, so the central difference is just 0.5 * (neighbor delta).
	float div = 0.5 * ((r - l) + (u - d) + (f - b));

	fragColor = vec4(div, 0.0, 0.0, 1.0);
}
