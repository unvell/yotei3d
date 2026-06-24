
// Cloud god rays — vertex stage.
//
// A full-screen quad (clip-space ±1 from a ScreenMesh). It is forced to the far
// plane (gl_Position.z = w) so a LEQUAL depth test lets it draw only where the
// scene depth is also at infinity — i.e. sky / cloud pixels — and solid
// geometry in front of it (the ground) culls the shafts. The fragment stage
// ray-marches the view ray to integrate in-scattered sunlight.
attribute vec3 vertexPosition;

varying vec2 vNdc;

void main(void) {
	vNdc = vertexPosition.xy;
	gl_Position = vec4(vertexPosition.xy, 1.0, 1.0);   // z=w -> NDC z = 1 (far)
}
