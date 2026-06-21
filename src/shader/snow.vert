
attribute vec3 vertexPosition;
attribute vec3 vertexColor;
attribute float vertexSize;

uniform mat4 projectViewModelMatrix;
uniform float sizeScale;   // reference distance: flakes at this depth keep their base px size
uniform float maxSize;     // clamp so very near flakes don't explode

varying vec4 color;
varying float vDist;       // perspective depth (~distance from the camera)

void main(void) {
	vec4 pos = projectViewModelMatrix * vec4(vertexPosition, 1.0);
	gl_Position = pos;

	// pos.w is the perspective depth; nearer flakes (small w) become larger
	vDist = pos.w;
	float size = vertexSize * sizeScale / max(pos.w, 0.001);
	gl_PointSize = min(size, maxSize);

	color = vec4(vertexColor, 1.0);
}
