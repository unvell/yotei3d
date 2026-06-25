#version 300 es

// Fluid — PRESSURE solve (one Jacobi iteration).
//
// To make the field incompressible we solve the Poisson equation
//     ∇²p = divergence
// for a pressure field p, then subtract its gradient from the velocity. The
// discrete Laplacian with unit cell spacing is (sum of 6 neighbors − 6·p), so
//     6·p = (pL+pR+pD+pU+pB+pF) − divergence
//     p   = ((sum of neighbors) − divergence) / 6
// One pass relaxes the estimate a little; the effect runs ~20–40 of these,
// ping-ponging the pressure texture, to converge. Warm-starting from last
// frame's pressure makes a handful of iterations enough.
precision highp float;
precision highp sampler3D;

uniform sampler3D pressureTex;
uniform sampler3D divergenceTex;
uniform vec3 uN;
uniform float zLayer;

out vec4 fragColor;

void main(void) {
	vec3 P = vec3(gl_FragCoord.xy, zLayer + 0.5);

	float l = texture(pressureTex, (P - vec3(1.0, 0.0, 0.0)) / uN).x;
	float r = texture(pressureTex, (P + vec3(1.0, 0.0, 0.0)) / uN).x;
	float d = texture(pressureTex, (P - vec3(0.0, 1.0, 0.0)) / uN).x;
	float u = texture(pressureTex, (P + vec3(0.0, 1.0, 0.0)) / uN).x;
	float b = texture(pressureTex, (P - vec3(0.0, 0.0, 1.0)) / uN).x;
	float f = texture(pressureTex, (P + vec3(0.0, 0.0, 1.0)) / uN).x;

	float div = texture(divergenceTex, P / uN).x;

	float p = (l + r + d + u + b + f - div) / 6.0;

	fragColor = vec4(p, 0.0, 0.0, 1.0);
}
