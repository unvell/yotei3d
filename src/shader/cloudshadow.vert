
attribute vec3 vertexPosition;

uniform mat4 projectViewModelMatrix;

varying vec2 vLocal;   // [-1..1] across the quad (edge midpoints at ±1)

void main(void) {
	gl_Position = projectViewModelMatrix * vec4(vertexPosition, 1.0);

	// PlaneMesh local coords are ±0.5 in X/Z; scale to ±1 so the fragment can
	// build a radial blob independent of the quad's world size.
	vLocal = vertexPosition.xz * 2.0;
}
