
// Cloud transmittance map — vertex stage.
//
// Renders the cloud puffs as point sprites from the sun's *orthographic*
// viewpoint. Because the projection is orthographic (w == 1) each puff keeps a
// constant, world-consistent footprint regardless of its distance along the sun
// axis, so the resulting map is a top-down (light-space) silhouette of the
// cloud field. The fragment stage accumulates optical density into it.
attribute vec3 vertexPosition;
attribute float vertexSize;

uniform mat4 projectViewModelMatrix;  // obj._transform * lightViewProj
uniform float worldToPx;              // map pixels per world unit (res / orthoWidth)
uniform float puffScale;              // calibrates puff footprint to the visible cloud
uniform vec2 fadeHalf;                // volume half-extent (x, z) for the rim fade
uniform float fadeMargin;             // fraction of the half-extent to fade over

varying float vSeed;
varying float vFade;

void main(void) {
	gl_Position = projectViewModelMatrix * vec4(vertexPosition, 1.0);

	// orthographic: size is world-constant (no perspective divide by w)
	gl_PointSize = max(vertexSize * puffScale * worldToPx, 1.0);

	// stable per-puff seed so the lumpy edge matches the cloud shader's
	vSeed = fract(sin(vertexSize * 91.73) * 43758.5453);

	// fade puffs out toward the drift-volume rim, same as the cloud shader, so
	// the shadow eases in/out with the clusters instead of popping
	vec2 q = abs(vertexPosition.xz) / max(fadeHalf, vec2(0.001));
	float e = max(q.x, q.y);
	vFade = 1.0 - smoothstep(1.0 - fadeMargin, 1.0, e);
}
