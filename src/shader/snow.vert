
attribute vec3 vertexPosition;
attribute vec3 vertexColor;
attribute float vertexSize;

uniform mat4 projectViewModelMatrix;

varying vec4 color;

void main(void) {
	gl_Position = projectViewModelMatrix * vec4(vertexPosition, 1.0);

	// vertexSize carries the flake size (in pixels)
	gl_PointSize = vertexSize;

	color = vec4(vertexColor, 1.0);
}
