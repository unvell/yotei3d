
attribute vec3 vertexPosition;
attribute vec3 vertexColor;
attribute float vertexSize;

uniform mat4 projectViewModelMatrix;

varying vec4 color;

void main(void) {
	gl_Position = projectViewModelMatrix * vec4(vertexPosition, 1.0);

	// vertexSize carries the streak length (in pixels) for each raindrop
	gl_PointSize = vertexSize;

	color = vec4(vertexColor, 1.0);
}
