
// Gerstner-wave ocean surface.
//
// The water plane is a flat tessellated grid; all the undulation happens here
// on the GPU by summing a few Gerstner waves, so the mesh itself never changes
// and the CPU only advances a single `time` uniform each frame. Each wave also
// contributes to an analytic surface normal (GPU Gems 1, ch.1) which is passed
// to the fragment shader for lighting and reflection — far cheaper and smoother
// than deriving normals from neighbouring vertices.

attribute vec3 vertexPosition;

uniform mat4 projectViewMatrix;
uniform mat4 modelMatrix;
uniform float time;

uniform vec2  windDir;     // primary wave heading (need not be normalized)
uniform float waveAmp;     // amplitude of the largest wave (world units)
uniform float waveLen;     // wavelength of the largest wave (world units)
uniform float waveSpeed;   // crest travel speed scale
uniform float steepness;   // 0 = rolling swell .. 1 = sharp choppy crests

varying vec3 vWorldPos;
varying vec3 vNormal;
varying vec2 vWorldXZ;
varying float vCrest;      // 0 at troughs .. 1 at crests, for foam/tint

const int WAVE_COUNT = 4;
const float TWO_PI = 6.2831853;

void main(void) {
	// world-space position of the flat grid vertex, before displacement
	vec4 worldFlat = modelMatrix * vec4(vertexPosition, 1.0);
	vec2 pos = worldFlat.xz;

	vec3 disp = vec3(0.0);
	vec3 nrm = vec3(0.0, 1.0, 0.0);

	float baseAng = atan(windDir.y, windDir.x);
	float amp = waveAmp;
	float len = waveLen;
	float crest = 0.0;
	float ampSum = 0.0;

	// Sum several Gerstner waves of geometrically shrinking amplitude and
	// wavelength, each fanned out a little from the wind heading so the surface
	// reads as a real, directional sea rather than one repeating ripple.
	for (int i = 0; i < WAVE_COUNT; i++) {
		float fi = float(i);
		float ang = baseAng + (fi - 1.5) * 0.5;   // spread headings around the wind
		vec2 d = vec2(cos(ang), sin(ang));

		float k = TWO_PI / len;                   // wave number
		float c = waveSpeed * sqrt(9.81 / k);     // deep-water phase speed
		float phase = k * dot(d, pos) - c * time * k;
		float s = sin(phase);
		float cs = cos(phase);

		// steepness Q is clamped so crests never pinch into loops
		float Q = steepness / (k * amp * float(WAVE_COUNT));

		disp.x += Q * amp * d.x * cs;
		disp.z += Q * amp * d.y * cs;
		disp.y += amp * s;

		float wa = k * amp;
		nrm.x -= d.x * wa * cs;
		nrm.z -= d.y * wa * cs;
		nrm.y -= Q * wa * s;

		crest += (s * 0.5 + 0.5) * amp;
		ampSum += amp;

		amp *= 0.5;
		len *= 0.55;
	}

	vec3 worldPos = worldFlat.xyz + disp;

	vWorldPos = worldPos;
	vWorldXZ = pos;
	vNormal = normalize(nrm);
	vCrest = ampSum > 0.0 ? clamp(crest / ampSum, 0.0, 1.0) : 0.5;

	gl_Position = projectViewMatrix * vec4(worldPos, 1.0);
}
