#version 300 es

// Cloud density bake — vertex stage.
// A full-screen quad (ScreenMesh, clip-space ±1) drawn once per Z-slice of the
// density volume. No math here: the fragment stage reconstructs each voxel's 3D
// cell coordinate and writes the density. ES 3.00 so the bake target can be a
// layer of a 3D texture.
in vec3 vertexPosition;

void main(void) {
	gl_Position = vec4(vertexPosition.xy, 0.0, 1.0);
}
