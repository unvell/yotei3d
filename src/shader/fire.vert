
attribute vec3 vertexPosition;
attribute vec3 vertexColor;   // per-particle hot colour, already pre-faded by life
attribute float vertexSize;

uniform mat4 projectViewModelMatrix;
uniform float sizeScale;   // reference depth: embers at this depth keep their base px size
uniform float maxSize;     // clamp so very near embers don't explode

varying vec4 color;

void main(void) {
	vec4 pos = projectViewModelMatrix * vec4(vertexPosition, 1.0);
	gl_Position = pos;

	// perspective sizing: nearer embers (small w) become larger
	float size = vertexSize * sizeScale / max(pos.w, 0.001);
	gl_PointSize = min(size, maxSize);

	color = vec4(vertexColor, 1.0);
}
