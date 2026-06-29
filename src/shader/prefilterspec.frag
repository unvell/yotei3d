
precision highp float;

// Specular IBL prefilter (Karis split-sum, prefiltered environment map).
//
// For one output direction (= reflection vector R, which we take equal to the
// view-aligned normal N) integrate the source environment over the GGX
// specular lobe for a fixed `roughness`, by importance-sampling the GGX NDF.
// IBLBaker renders this once per mip level of the target cube, increasing
// `roughness` with the mip index, so the standard shader can sample a
// physically blurred reflection via textureCube(refMap, R, roughness*maxLod).
//
// Written for GLSL ES 1.00 (WebGL1-style, the engine's shader dialect): no
// bitwise ops / uint, so the Van der Corput radical inverse is done in float
// arithmetic, and the source is sampled with the textureCube LOD-bias form.

uniform samplerCube envMap;
uniform float roughness;
uniform float resolution;   // source cube face size (texels), for firefly mip bias

varying vec3 vDir;

const float PI = 3.14159265359;
const int SAMPLE_COUNT = 64;

// Base-2 radical inverse without bitwise ops: peel the low bit of the
// integer-valued `bits` each step and accumulate it as a binary fraction.
float radicalInverseVdC(float bits) {
	float result = 0.0;
	float invBase = 0.5;
	for (int i = 0; i < 32; i++) {
		if (bits < 1.0) break;
		float digit = mod(bits, 2.0);
		result += digit * invBase;
		invBase *= 0.5;
		bits = floor(bits * 0.5);
	}
	return result;
}

vec2 hammersley(int i, int n) {
	return vec2(float(i) / float(n), radicalInverseVdC(float(i)));
}

// Sample a half-vector around N from the GGX distribution for `rough`.
vec3 importanceSampleGGX(vec2 Xi, vec3 N, float rough) {
	float a = rough * rough;

	float phi = 2.0 * PI * Xi.x;
	float cosTheta = sqrt((1.0 - Xi.y) / (1.0 + (a * a - 1.0) * Xi.y));
	float sinTheta = sqrt(1.0 - cosTheta * cosTheta);

	// spherical -> cartesian (tangent space, N = +z)
	vec3 H = vec3(cos(phi) * sinTheta, sin(phi) * sinTheta, cosTheta);

	// tangent space -> world
	vec3 up = abs(N.z) < 0.999 ? vec3(0.0, 0.0, 1.0) : vec3(1.0, 0.0, 0.0);
	vec3 tangent = normalize(cross(up, N));
	vec3 bitangent = cross(N, tangent);

	return normalize(tangent * H.x + bitangent * H.y + N * H.z);
}

float distributionGGX(float NdotH, float rough) {
	float a = rough * rough;
	float a2 = a * a;
	float d = NdotH * NdotH * (a2 - 1.0) + 1.0;
	return a2 / max(PI * d * d, 1.0e-7);
}

void main(void) {
	vec3 N = normalize(vDir);
	// the split-sum prefilter assumes the view direction equals the normal, so
	// the reflection vector R is N as well.
	vec3 R = N;
	vec3 V = N;

	// solid angle covered by one source texel, for the firefly-suppression mip
	// bias below (a brighter, wider lobe samples coarser source mips).
	float saTexel = 4.0 * PI / (6.0 * resolution * resolution);

	vec3 prefiltered = vec3(0.0);
	float totalWeight = 0.0;

	for (int i = 0; i < SAMPLE_COUNT; i++) {
		vec2 Xi = hammersley(i, SAMPLE_COUNT);
		vec3 H = importanceSampleGGX(Xi, N, roughness);
		vec3 L = normalize(2.0 * dot(V, H) * H - V);

		float NdotL = max(dot(N, L), 0.0);
		if (NdotL > 0.0) {
			// pick a source mip from the sample's solid angle vs. a texel's, so
			// bright pixels (a sharp sun in HDR) don't alias into fireflies.
			float NdotH = max(dot(N, H), 0.0);
			float HdotV = max(dot(H, V), 0.0);
			float D = distributionGGX(NdotH, roughness);
			float pdf = (D * NdotH / (4.0 * HdotV)) + 1.0e-4;
			float saSample = 1.0 / (float(SAMPLE_COUNT) * pdf + 1.0e-4);
			float mipBias = roughness < 1.0e-3 ? 0.0 : 0.5 * log2(saSample / saTexel);

			prefiltered += textureCube(envMap, L, mipBias).rgb * NdotL;
			totalWeight += NdotL;
		}
	}

	prefiltered = prefiltered / max(totalWeight, 1.0e-4);

	gl_FragColor = vec4(prefiltered, 1.0);
}
