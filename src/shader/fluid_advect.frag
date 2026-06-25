#version 300 es

// Fluid — ADVECTION (semi-Lagrangian).
//
// Move a field along the velocity field. Instead of pushing each parcel
// forward (which would scatter to non-grid positions), we look BACKWARD: for
// this cell, find where the stuff now here came from one step ago, and copy
// that value. Backward tracing is unconditionally stable (Stam's "stable
// fluids") — the value can never blow up because it is always an interpolated
// sample of the previous state.
//
// Coordinate convention (shared by every fluid kernel):
//   P  = cell-center grid coordinate in [0, N], = (gl_FragCoord.xy, zLayer+0.5)
//   to sample a field at grid coord Q:  texture(field, Q / uN)
//   one cell step = 1.0 in grid space; velocity is stored in cells/second.
precision highp float;
precision highp sampler3D;

uniform sampler3D velTex;        // velocity field (does the transporting)
uniform sampler3D srcTex;        // field being transported (velocity, or density/temp)
uniform vec3 uN;                 // grid resolution (cells)
uniform float zLayer;            // integer index of the slice being written
uniform float dt;                // timestep (seconds)
uniform float dissipation;       // per-step decay (1.0 = none; <1 fades smoke out)

out vec4 fragColor;

void main(void) {
	vec3 P = vec3(gl_FragCoord.xy, zLayer + 0.5);

	// velocity here, then trace this cell back along it
	vec3 vel = texture(velTex, P / uN).xyz;
	vec3 Pprev = P - dt * vel;

	// CLAMP_TO_EDGE on the volume makes out-of-domain back-traces read the
	// border cell instead of wrapping — an open boundary.
	fragColor = dissipation * texture(srcTex, Pprev / uN);
}
