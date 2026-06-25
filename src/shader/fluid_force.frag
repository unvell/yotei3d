#version 300 es

// Fluid — BUOYANCY / external forces (applied to velocity).
//
// Hot fluid rises, heavy (smoke-laden) fluid sinks. We nudge the vertical
// velocity by a force proportional to how much hotter than ambient this cell is
// (buoyancy, upward) minus its smoke density (weight, downward). This is what
// turns a blob of injected density+heat into a rising, curling plume.
precision highp float;
precision highp sampler3D;

uniform sampler3D velTex;
uniform sampler3D dcTex;         // R = density, G = temperature
uniform vec3 uN;
uniform float zLayer;
uniform float dt;
uniform float buoyancy;          // upward force per degree above ambient
uniform float weight;            // downward force per unit density
uniform float ambientTemp;       // temperature that produces no buoyancy

out vec4 fragColor;

void main(void) {
	vec3 P = vec3(gl_FragCoord.xy, zLayer + 0.5);

	vec3 vel = texture(velTex, P / uN).xyz;
	vec2 dc = texture(dcTex, P / uN).rg;
	float density = dc.r;
	float temp = dc.g;

	vel.y += dt * (buoyancy * (temp - ambientTemp) - weight * density);

	fragColor = vec4(vel, 0.0);
}
