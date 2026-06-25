#version 300 es

// Fluid — BUOYANCY / external forces (applied to velocity).
//
// Three contributions to the velocity here:
//   * buoyancy — hot fluid rises, heavy (smoke-laden) fluid sinks;
//   * a turbulence SEED — a little time-varying swirl proportional to heat, to
//     break the perfectly symmetric column so vorticity confinement has eddies
//     to amplify (without it a symmetric source stays a laminar pillar);
//   * the MOUSE — a velocity impulse around the cursor while dragging.
precision highp float;
precision highp sampler3D;

uniform sampler3D velTex;
uniform sampler3D dcTex;         // R = density, G = temperature
uniform vec3 uN;
uniform float zLayer;
uniform float dt;
uniform float buoyancy;
uniform float weight;
uniform float ambientTemp;
uniform float time;
uniform float seedStrength;

uniform float mouseActive;       // 1 while dragging, else 0
uniform vec3 mousePos;           // grid coords
uniform float mouseRadius;
uniform vec3 mouseVel;           // grid units/sec to inject

out vec4 fragColor;

// cheap 3D value hash
float hash(vec3 p) {
	p = fract(p * 0.3183099 + 0.1);
	p *= 17.0;
	return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}

void main(void) {
	vec3 P = vec3(gl_FragCoord.xy, zLayer + 0.5);

	vec3 vel = texture(velTex, P / uN).xyz;
	vec2 dc = texture(dcTex, P / uN).rg;
	float density = dc.r;
	float temp = dc.g;

	// buoyancy
	vel.y += dt * (buoyancy * (temp - ambientTemp) - weight * density);

	// turbulence seed (only where there is fresh heat)
	float n1 = hash(P * 0.15 + vec3(0.0, 0.0, time));
	float n2 = hash(P * 0.15 + vec3(7.3, 2.1, time));
	vel.x += seedStrength * (n1 - 0.5) * temp * dt;
	vel.z += seedStrength * (n2 - 0.5) * temp * dt;

	// mouse drag
	if (mouseActive > 0.5) {
		float d = distance(P, mousePos);
		float g = exp(-(d * d) / (mouseRadius * mouseRadius));
		vel += mouseVel * g * dt;
	}

	fragColor = vec4(vel, 0.0);
}
