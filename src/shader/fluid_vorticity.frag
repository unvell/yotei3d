#version 300 es

// Fluid — VORTICITY CONFINEMENT.
//
// Semi-Lagrangian advection is stable but diffusive: it quietly smears out the
// small eddies, so the plume goes smooth and laminar (the "pillar"). This adds
// them back. Where the vorticity magnitude has a gradient, we push velocity
// along (N × ω) — toward the centers of existing vortices — which re-energizes
// the curling motion that reads as turbulent smoke. `vorticity` (epsilon) scales
// how aggressively.
precision highp float;
precision highp sampler3D;

uniform sampler3D velTex;
uniform sampler3D curlTex;
uniform vec3 uN;
uniform float zLayer;
uniform float dt;
uniform float vorticity;

out vec4 fragColor;

void main(void) {
	vec3 P = vec3(gl_FragCoord.xy, zLayer + 0.5);

	// gradient of |ω| from the 6 neighbours -> direction toward higher vorticity
	float ml = length(texture(curlTex, (P - vec3(1.0, 0.0, 0.0)) / uN).xyz);
	float mr = length(texture(curlTex, (P + vec3(1.0, 0.0, 0.0)) / uN).xyz);
	float md = length(texture(curlTex, (P - vec3(0.0, 1.0, 0.0)) / uN).xyz);
	float mu = length(texture(curlTex, (P + vec3(0.0, 1.0, 0.0)) / uN).xyz);
	float mb = length(texture(curlTex, (P - vec3(0.0, 0.0, 1.0)) / uN).xyz);
	float mf = length(texture(curlTex, (P + vec3(0.0, 0.0, 1.0)) / uN).xyz);

	vec3 grad = 0.5 * vec3(mr - ml, mu - md, mf - mb);
	vec3 Nv = grad / (length(grad) + 1e-5);

	vec3 w = texture(curlTex, P / uN).xyz;
	vec3 force = vorticity * cross(Nv, w);

	vec3 vel = texture(velTex, P / uN).xyz;
	vel += dt * force;

	fragColor = vec4(vel, 0.0);
}
