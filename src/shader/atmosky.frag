
precision highp float;

// Procedural physically-motivated sky — single-scattering (Rayleigh + Mie)
// atmosphere, integrated by ray-marching through a spherical-shell atmosphere.
// Rendered once per cube face (via ibl.vert, which hands us the world-space view
// direction `vDir` for each fragment) so the result is baked into the same HDR
// cubemap the engine already uses for the skybox background and image-based
// lighting. Driving `sunDirection` over time gives a dynamic time-of-day sky
// whose reflections and ambient light track the sun.
//
// This is the compact cousin of a precomputed-atmospheric-scattering model: it
// trades the LUTs for a short in-shader march (cheap because it only runs while
// baking the cubemap, not per scene pixel). Output is linear HDR radiance; the
// engine's tonemap handles display.

varying vec3 vDir;

uniform vec3 sunDirection;      // normalized, world space (+Y up), points toward the sun

// atmosphere tunables (defaults model Earth at sea level)
uniform float sunIntensity;     // radiance scale of the sun (e.g. 22.0)
uniform vec3 rayleighCoeff;     // Rayleigh scattering per channel (e.g. 5.5e-6, 13.0e-6, 22.4e-6)
uniform float mieCoeff;         // Mie scattering coefficient (e.g. 21e-6)
uniform float rayleighScale;    // Rayleigh scale height in m (e.g. 8000)
uniform float mieScale;         // Mie scale height in m (e.g. 1200)
uniform float mieG;             // Mie directionality, -1..1 (e.g. 0.758)
uniform float planetRadius;     // m (e.g. 6371000)
uniform float atmosphereRadius; // m (e.g. 6471000)
uniform vec3 groundAlbedo;      // matte ground colour for the lower hemisphere

const float PI = 3.141592653589793;
const int PRIMARY_STEPS = 16;   // samples along the view ray
const int LIGHT_STEPS = 8;      // samples along the light ray (optical depth to the sun)

// Ray-sphere intersection centered at the origin. Returns (near, far) t along
// rd. No intersection -> near > far (an empty interval).
vec2 raySphere(vec3 r0, vec3 rd, float sr) {
	float a = dot(rd, rd);
	float b = 2.0 * dot(rd, r0);
	float c = dot(r0, r0) - sr * sr;
	float d = b * b - 4.0 * a * c;
	if (d < 0.0) return vec2(1e16, -1e16);
	d = sqrt(d);
	return vec2((-b - d) / (2.0 * a), (-b + d) / (2.0 * a));
}

vec3 computeSky(vec3 dir, vec3 r0, vec3 sunDir) {
	// march the segment of the view ray that lies inside the atmosphere shell
	vec2 atmHit = raySphere(r0, dir, atmosphereRadius);
	if (atmHit.x > atmHit.y) return vec3(0.0);

	// stop the march at the planet surface if the ray dips below the horizon
	vec2 planetHit = raySphere(r0, dir, planetRadius);
	float marchEnd = atmHit.y;
	if (planetHit.x > 0.0) marchEnd = min(marchEnd, planetHit.x);
	float marchStart = max(atmHit.x, 0.0);

	float stepSize = (marchEnd - marchStart) / float(PRIMARY_STEPS);
	float t = marchStart;

	vec3 totalRlh = vec3(0.0);
	vec3 totalMie = vec3(0.0);
	float odRlh = 0.0; // accumulated optical depth along the view ray
	float odMie = 0.0;

	// scattering phase functions
	float mu = dot(dir, sunDir);
	float mumu = mu * mu;
	float gg = mieG * mieG;
	float phaseRlh = 3.0 / (16.0 * PI) * (1.0 + mumu);
	float phaseMie = 3.0 / (8.0 * PI) * ((1.0 - gg) * (1.0 + mumu))
		/ (pow(1.0 + gg - 2.0 * mu * mieG, 1.5) * (2.0 + gg));

	for (int i = 0; i < PRIMARY_STEPS; i++) {
		vec3 pos = r0 + dir * (t + stepSize * 0.5);
		float height = length(pos) - planetRadius;

		float hRlh = exp(-height / rayleighScale) * stepSize;
		float hMie = exp(-height / mieScale) * stepSize;
		odRlh += hRlh;
		odMie += hMie;

		// optical depth from this sample toward the sun
		float lightFar = raySphere(pos, sunDir, atmosphereRadius).y;
		float lStep = lightFar / float(LIGHT_STEPS);
		float lt = 0.0;
		float lOdRlh = 0.0;
		float lOdMie = 0.0;
		for (int j = 0; j < LIGHT_STEPS; j++) {
			vec3 lpos = pos + sunDir * (lt + lStep * 0.5);
			float lh = length(lpos) - planetRadius;
			lOdRlh += exp(-lh / rayleighScale) * lStep;
			lOdMie += exp(-lh / mieScale) * lStep;
			lt += lStep;
		}

		// transmittance = attenuation along view ray so far + light ray
		vec3 tau = rayleighCoeff * (odRlh + lOdRlh)
			+ mieCoeff * 1.1 * (odMie + lOdMie);
		vec3 attn = exp(-tau);

		totalRlh += hRlh * attn;
		totalMie += hMie * attn;
		t += stepSize;
	}

	return sunIntensity * (phaseRlh * rayleighCoeff * totalRlh
		+ phaseMie * mieCoeff * totalMie);
}

void main(void) {
	// `vDir` (from ibl.vert) is the per-face basis direction used while baking
	// into the cube face. Rendering into a cube face through an FBO is vertically
	// mirrored relative to how the cube is later sampled, so the basis direction
	// has its elevation flipped versus the true sampling direction. Undo that flip
	// here (a pure vertical mirror) so the baked texel for sampling direction D
	// holds sky(D) — keeping the skybox background, reflections and the diffuse
	// irradiance bake all consistent. The image-loaded path (equirect) instead
	// absorbs this flip in its lat-long lookup.
	vec3 dir = normalize(vec3(vDir.x, -vDir.y, vDir.z));

	// eye just above the planet surface; the sky is effectively at infinity so a
	// small height keeps the horizon crisp without scene-scale dependence.
	vec3 r0 = vec3(0.0, planetRadius + 1.0, 0.0);
	vec3 sunDir = normalize(sunDirection);

	// Sample the sky along the view ray, clamped to the horizon so downward rays
	// reuse the horizon radiance (the bare single-scattering model returns ~0
	// below the horizon, which would read as a black band).
	vec3 skyDir = normalize(vec3(dir.x, max(dir.y, 0.0), dir.z));
	vec3 col = computeSky(skyDir, r0, sunDir);

	// Below the horizon, fade to a matte ground lit by that horizon sky + a soft
	// sun term, so the lower hemisphere is a believable ground for both the
	// background and the diffuse IBL bake (no black band).
	if (dir.y < 0.0) {
		float t = clamp(-dir.y * 6.0, 0.0, 1.0);
		float sunDot = max(sunDir.y, 0.0);            // daylight strength
		vec3 ground = groundAlbedo * (col + sunIntensity * 0.0015 * sunDot);
		col = mix(col, ground, t);
	}

	gl_FragColor = vec4(col, 1.0);
}
