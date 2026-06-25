#version 300 es

// Fluid — render (raymarch) vertex stage.
// Full-screen quad into a (half-res) off-screen buffer; we pass the NDC so the
// fragment stage can rebuild the world-space view ray from invViewProj, march
// the simulation's density box, and output premultiplied smoke/fire radiance.
in vec3 vertexPosition;

out vec2 vNdc;

void main(void) {
	vNdc = vertexPosition.xy;
	gl_Position = vec4(vertexPosition.xy, 0.0, 1.0);
}
