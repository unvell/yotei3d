
precision highp float;

uniform samplerCube texture;
uniform vec3 color;

// true: linear HDR panorama (already linear); false: sRGB LDR cubemap (decode).
uniform bool hdrSource;

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

	// Bring the sky into linear-HDR space so it shares the scene's single
	// tone-map/encode in the final screen pass (docs/RENDERING.md §2 Stage B/C).
	// HDR panoramas are already linear; sRGB LDR cube faces are decoded.
	vec3 sky = textureCube(texture, texcoord).rgb;
	if (!hdrSource) sky = pow(sky, vec3(2.2));
	vec3 fcolor = sky * color;

	// Blend toward the haze colour in linear space, before tone mapping, so the
	// lower sky goes through the same exposure roll-off as the ocean's linear
	// fog and the two stay matched across the seam.
	if (hasSkyFog) {
		vec3 dir = normalize(texcoord);
		float h = 1.0 - smoothstep(skyFogLower, skyFogUpper, dir.y);
		fcolor = mix(fcolor, skyFogColor, clamp(h, 0.0, 1.0) * skyFogDensity);
	}

	gl_FragColor = vec4(fcolor, 1.0);
}