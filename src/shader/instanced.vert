
attribute vec3 vertexPosition;
attribute vec3 vertexNormal;
attribute vec2 vertexTexcoord;
attribute vec3 vertexColor;

// Per-instance model matrix (vertexAttribDivisor = 1). Occupies attribute
// locations 10..13. Uploaded as Matrix4.toArray(), identical layout to the
// modelMatrix uniform used by the standard shader.
attribute mat4 instanceMatrix;

uniform mat4 projectViewMatrix;

varying vec3 vNormal;
varying vec2 vTexcoord;
varying vec3 vColor;
varying vec3 vWorld;

void main(void) {
	vec4 worldPos = instanceMatrix * vec4(vertexPosition, 1.0);

	gl_Position = projectViewMatrix * worldPos;

	// Correct for rotation + uniform scale (the common case for scattered
	// instances); normalize absorbs the uniform scale factor.
	vNormal = normalize((instanceMatrix * vec4(vertexNormal, 0.0)).xyz);
	vTexcoord = vertexTexcoord;
	vColor = vertexColor;
	vWorld = worldPos.xyz;
}
