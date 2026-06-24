
// Volumetric clouds — composite fragment stage.
// Samples the pre-rendered cloud buffer (premultiplied: in-scattered radiance in
// rgb, coverage in a) and emits it directly. Linear filtering on the half-res
// buffer upsamples it smoothly; the premultiplied blend (ONE, ONE_MINUS_SRC_ALPHA)
// set by the wrapper composites it over the scene = scattered + transmittance*scene.
precision highp float;

varying vec2 vUv;

uniform sampler2D cloudTex;

void main(void) {
	gl_FragColor = texture2D(cloudTex, vUv);
}
