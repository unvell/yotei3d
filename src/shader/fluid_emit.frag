#version 300 es

// Fluid — EMITTER (inject density + heat).
//
// A continuous source: add a soft Gaussian blob of smoke density and
// temperature around `emitPos` every step. Advection carries it upward and the
// per-step dissipation fades it, so the two balance into a steady plume. In a
// later stage the mouse drives a second, movable emitter through these same
// uniforms.
precision highp float;
precision highp sampler3D;

uniform sampler3D dcTex;         // current density/temperature (R/G)
uniform vec3 uN;
uniform float zLayer;
uniform float dt;
uniform vec3 emitPos;            // emitter center, grid coords
uniform float emitRadius;        // Gaussian falloff radius, cells
uniform float emitDensity;       // density added per second at the center
uniform float emitTemp;          // temperature added per second at the center

out vec4 fragColor;

void main(void) {
	vec3 P = vec3(gl_FragCoord.xy, zLayer + 0.5);

	vec4 dc = texture(dcTex, P / uN);

	float d = distance(P, emitPos);
	float g = exp(-(d * d) / (emitRadius * emitRadius));

	dc.r += dt * emitDensity * g;
	dc.g += dt * emitTemp * g;

	fragColor = dc;
}
