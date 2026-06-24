
// Volumetric clouds — composite vertex stage.
// Full-screen quad forced to the far plane; the fragment stage samples the
// pre-rendered (half-res) cloud buffer and blends it over the scene. Depth test
// is disabled by the shader wrapper (the clouds are sky), matching the cloud
// god-ray pass, so this never z-fights the skybox.
attribute vec3 vertexPosition;

varying vec2 vUv;

void main(void) {
	vUv = vertexPosition.xy * 0.5 + 0.5;
	gl_Position = vec4(vertexPosition.xy, 1.0, 1.0);
}
