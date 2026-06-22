
attribute vec3 vertexPosition;
attribute vec3 vertexNormal;
attribute vec2 vertexTexcoord;
attribute vec3 vertexColor;

// Per-instance model matrix (vertexAttribDivisor = 1). Occupies attribute
// locations 10..13. Uploaded as Matrix4.toArray(), identical layout to the
// modelMatrix uniform used by the standard shader.
attribute mat4 instanceMatrix;

uniform mat4 projectViewMatrix;
uniform mat4 modelMatrix;   // the InstancedObject's own world transform

varying vec3 vNormal;
varying vec2 vTexcoord;
varying vec3 vColor;
varying vec3 vWorld;

void main(void) {
	// instances are placed relative to the object, so the object can be moved /
	// rotated / scaled as a whole (and orbit controllers work on it).
	mat4 m = modelMatrix * instanceMatrix;

	vec4 worldPos = m * vec4(vertexPosition, 1.0);

	gl_Position = projectViewMatrix * worldPos;

	// Correct for rotation + uniform scale (the common case for scattered
	// instances); normalize absorbs the uniform scale factor.
	vNormal = normalize((m * vec4(vertexNormal, 0.0)).xyz);
	vTexcoord = vertexTexcoord;
	vColor = vertexColor;
	vWorld = worldPos.xyz;
}
