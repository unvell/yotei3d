
attribute vec3 vertexPosition;
attribute vec3 vertexColor;
attribute float vertexSize;

uniform mat4 projectViewModelMatrix;
uniform float sizeScale;   // reference distance: puffs at this depth keep their base px size
uniform float maxSize;     // clamp so very near puffs don't explode
uniform vec2 fadeHalf;     // volume half-extent (x, z): puffs ease out toward the rim
uniform float fadeMargin;  // fraction of the half-extent over which to fade (0..1)

varying vec4 color;
varying float vSeed;        // stable per-puff seed so the fbm texture varies
varying float vFade;        // edge fade (1 in the core .. 0 at the volume rim)

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

	// fade puffs out toward the edges of the drift volume so clusters that
	// wrap around (or first stream in) ease in and out instead of popping.
	// positions are in object space, so the volume centre is the origin.
	vec2 q = abs(vertexPosition.xz) / max(fadeHalf, vec2(0.001));
	float e = max(q.x, q.y);
	vFade = 1.0 - smoothstep(1.0 - fadeMargin, 1.0, e);
}
