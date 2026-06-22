
attribute vec3 vertexPosition;
attribute vec3 vertexColor;   // .r carries the per-puff life alpha (see Smoke effect)
attribute float vertexSize;

uniform mat4 projectViewModelMatrix;
uniform float sizeScale;   // reference depth: puffs at this depth keep their base px size
uniform float maxSize;     // clamp so very near puffs don't explode

varying float vAlpha;

void main(void) {
	vec4 pos = projectViewModelMatrix * vec4(vertexPosition, 1.0);
	gl_Position = pos;

	// perspective sizing: nearer puffs (small w) become larger
	float size = vertexSize * sizeScale / max(pos.w, 0.001);
	gl_PointSize = min(size, maxSize);

	// ParticleMesh only carries a vec3 colour, so the per-puff alpha rides in
	// the red channel; the grey tint itself comes from the `color` uniform.
	vAlpha = vertexColor.r;
}
