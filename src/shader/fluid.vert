#version 300 es

// Fluid simulation — shared full-screen vertex stage.
// Every simulation "kernel" runs as a full-screen quad over one Z-slice of a
// 3D texture (see Volume3DTarget). The fragment stage reconstructs its cell
// from gl_FragCoord.xy + a per-slice `zLayer` uniform, so the vertex stage only
// has to cover the slice — no varyings needed.
in vec3 vertexPosition;

void main(void) {
	gl_Position = vec4(vertexPosition.xy, 0.0, 1.0);
}
