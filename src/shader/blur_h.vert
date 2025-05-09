
attribute vec3 vertexPosition;
attribute vec2 vertexTexcoord;

uniform mat4 projectViewModelMatrix;

varying vec2 texcoord;

void main(void) {
	gl_Position = projectViewModelMatrix * vec4(vertexPosition, 1.0);
	texcoord = vertexTexcoord;
}