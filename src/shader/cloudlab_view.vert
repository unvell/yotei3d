#version 300 es

// Cloud viewer — vertex stage. Full-screen quad; hand the per-pixel NDC to the
// fragment stage so it can reconstruct the world-space view ray. ES 3.00 so the
// fragment stage can sample the density volume (sampler3D).
in vec3 vertexPosition;

out vec2 vNdc;

void main(void) {
	vNdc = vertexPosition.xy;
	gl_Position = vec4(vertexPosition.xy, 0.0, 1.0);
}
