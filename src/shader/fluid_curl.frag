#version 300 es

// Fluid — CURL (vorticity vector ω = ∇×u).
//
// The next pass (vorticity confinement) needs the local "spin" of the velocity
// field at every cell. This computes it with central differences and stores the
// 3-component vector. (Magnitude is taken later from neighbours, so we keep the
// full vector here.)
precision highp float;
precision highp sampler3D;

uniform sampler3D velTex;
uniform vec3 uN;
uniform float zLayer;

out vec4 fragColor;

void main(void) {
	vec3 P = vec3(gl_FragCoord.xy, zLayer + 0.5);

	vec3 xp = texture(velTex, (P + vec3(1.0, 0.0, 0.0)) / uN).xyz;
	vec3 xm = texture(velTex, (P - vec3(1.0, 0.0, 0.0)) / uN).xyz;
	vec3 yp = texture(velTex, (P + vec3(0.0, 1.0, 0.0)) / uN).xyz;
	vec3 ym = texture(velTex, (P - vec3(0.0, 1.0, 0.0)) / uN).xyz;
	vec3 zp = texture(velTex, (P + vec3(0.0, 0.0, 1.0)) / uN).xyz;
	vec3 zm = texture(velTex, (P - vec3(0.0, 0.0, 1.0)) / uN).xyz;

	vec3 w = 0.5 * vec3(
		(yp.z - ym.z) - (zp.y - zm.y),
		(zp.x - zm.x) - (xp.z - xm.z),
		(xp.y - xm.y) - (yp.x - ym.x));

	fragColor = vec4(w, 0.0);
}
