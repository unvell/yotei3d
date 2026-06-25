#version 300 es

// Volumetric clouds — raymarch vertex stage.
// A full-screen quad (clip-space ±1 from a ScreenMesh) rendered into a
// (half-resolution) off-screen buffer. We only need the per-pixel NDC to
// reconstruct the world-space view ray in the fragment stage.
// ES 3.00 so the fragment stage can sample the 3D noise volume (sampler3D).
in vec3 vertexPosition;

out vec2 vNdc;

void main(void) {
	vNdc = vertexPosition.xy;
	gl_Position = vec4(vertexPosition.xy, 0.0, 1.0);
}
