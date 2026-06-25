#version 300 es

// Fluid — EMITTER (inject density + heat).
//
// Two sources of fresh smoke/heat, each a soft Gaussian blob:
//   * the fixed bottom emitter (the continuous plume);
//   * the MOUSE, while dragging (interactive puffs).
// Advection carries them upward and the per-step dissipation fades them, so the
// two balance into a steady, living plume.
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

uniform float mouseActive;       // 1 while dragging, else 0
uniform vec3 mousePos;           // grid coords
uniform float mouseRadius;
uniform float mouseDensity;
uniform float mouseTemp;

out vec4 fragColor;

void main(void) {
	vec3 P = vec3(gl_FragCoord.xy, zLayer + 0.5);

	vec4 dc = texture(dcTex, P / uN);

	float d = distance(P, emitPos);
	float g = exp(-(d * d) / (emitRadius * emitRadius));
	dc.r += dt * emitDensity * g;
	dc.g += dt * emitTemp * g;

	if (mouseActive > 0.5) {
		float dm = distance(P, mousePos);
		float gm = exp(-(dm * dm) / (mouseRadius * mouseRadius));
		dc.r += dt * mouseDensity * gm;
		dc.g += dt * mouseTemp * gm;
	}

	fragColor = dc;
}
