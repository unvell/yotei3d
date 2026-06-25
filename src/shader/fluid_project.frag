#version 300 es

// Fluid — PROJECTION (subtract the pressure gradient).
//
// The pressure field from the Jacobi solve is exactly the scalar whose gradient
// equals the divergent part of the velocity. Subtracting that gradient leaves a
// divergence-free (incompressible) velocity field — the swirling, volume-
// preserving motion that makes smoke look like a fluid rather than a fog that
// merely fades.
precision highp float;
precision highp sampler3D;

uniform sampler3D velTex;
uniform sampler3D pressureTex;
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

	vec3 vel = texture(velTex, P / uN).xyz;
	vel -= 0.5 * vec3(r - l, u - d, f - b);

	fragColor = vec4(vel, 0.0);
}
