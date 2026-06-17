
attribute vec3 vertexPosition;
attribute vec2 vertexTexcoord;

// per-face basis: world direction = faceForward + faceRight * s + faceUp * t
// where (s, t) is the texcoord remapped to [-1, 1].
uniform vec3 faceForward;
uniform vec3 faceRight;
uniform vec3 faceUp;

varying vec3 vDir;

void main(void) {
	vec2 st = vertexTexcoord * 2.0 - 1.0;
	vDir = faceForward + faceRight * st.x + faceUp * st.y;

	// ScreenMesh vertices are already in clip space ([-1, 1]).
	gl_Position = vec4(vertexPosition.xy, 0.0, 1.0);
}
