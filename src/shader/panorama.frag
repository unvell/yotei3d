
precision highp float;

uniform samplerCube texture;
uniform vec3 color;

// > 0 enables exposure tone mapping, so an HDR sky's highlights roll off to
// 1.0 instead of hard-clipping to white. Matches standard.frag's tonemap() so
// the background stays consistent with lit/reflective objects. Left at 0 for
// ordinary LDR cubemap skyboxes (unchanged passthrough).
uniform float hdrExposure;

// Horizon haze: melt the lower band of the sky into the scene's fog colour so a
// fogged ground/ocean plane and the sky meet at the same colour instead of a
// hard horizon seam. Keyed on the view ray's vertical component (rotation about
// the vertical axis doesn't change it, so it stays put under skybox yaw). Full
// haze at/below skyFogLower, fading out to clear sky at skyFogUpper. Opt-in:
// disabled (hasSkyFog == false) for every skybox that doesn't set scene.skyFog.
uniform bool hasSkyFog;
uniform vec3 skyFogColor;
uniform float skyFogUpper;    // dir.y where haze has fully faded to clear sky
uniform float skyFogLower;    // dir.y at/below which haze is full
uniform float skyFogDensity;  // 0 = off .. 1 = fully replace sky with haze

varying vec3 texcoord;

void main(void) {

	vec3 fcolor = textureCube(texture, texcoord).rgb * color;

	// Blend toward the haze colour in linear space, before tone mapping, so the
	// lower sky goes through the same exposure roll-off as the ocean's linear
	// fog and the two stay matched across the seam.
	if (hasSkyFog) {
		vec3 dir = normalize(texcoord);
		float h = 1.0 - smoothstep(skyFogLower, skyFogUpper, dir.y);
		fcolor = mix(fcolor, skyFogColor, clamp(h, 0.0, 1.0) * skyFogDensity);
	}

	if (hdrExposure > 0.0) {
		fcolor = vec3(1.0) - exp(-fcolor * hdrExposure);
	}

	gl_FragColor = vec4(fcolor, 1.0);
}