
attribute vec3 vertexPosition;

uniform mat4 projectViewModelMatrix;
uniform mat4 modelMatrix;

varying vec2 vWorldXZ;   // world-space XZ, drives the noise (seamless under motion)
varying vec2 vLocal;     // local plane coords -0.5..0.5, for the edge fade

void main(void) {
	vec4 wp = modelMatrix * vec4(vertexPosition, 1.0);
	vWorldXZ = wp.xz;
	vLocal = vertexPosition.xz;   // PlaneMesh(1,1) spans -0.5..0.5

	gl_Position = projectViewModelMatrix * vec4(vertexPosition, 1.0);
}
