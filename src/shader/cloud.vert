
attribute vec3 vertexPosition;
attribute vec3 vertexColor;
attribute float vertexSize;

uniform mat4 projectViewModelMatrix;
uniform float sizeScale;   // reference distance: puffs at this depth keep their base px size
uniform float maxSize;     // clamp so very near puffs don't explode

varying vec4 color;
varying float vSeed;        // stable per-puff seed so the fbm texture varies

void main(void) {
	vec4 pos = projectViewModelMatrix * vec4(vertexPosition, 1.0);
	gl_Position = pos;

	// pos.w is the perspective depth; nearer puffs (small w) become larger
	float size = vertexSize * sizeScale / max(pos.w, 0.001);
	gl_PointSize = min(size, maxSize);

	color = vec4(vertexColor, 1.0);

	// derive a stable seed from the puff's size (constant per puff, so the
	// fluffy texture doesn't crawl as the cloud drifts)
	vSeed = fract(sin(vertexSize * 91.73) * 43758.5453);
}
