
precision highp float;

// Diffuse irradiance convolution: for each output direction (the hemisphere
// normal N) integrate the incoming radiance over the cosine-weighted
// hemisphere of the source environment cubemap. Baked once at runtime into a
// small cubemap, then sampled per-fragment as the diffuse ambient term.

uniform samplerCube envMap;

varying vec3 vDir;

const float PI = 3.14159265359;

void main(void) {
	vec3 N = normalize(vDir);

	// build a tangent basis around N
	vec3 up = abs(N.y) < 0.999 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0);
	vec3 right = normalize(cross(up, N));
	up = normalize(cross(N, right));

	vec3 irradiance = vec3(0.0);
	float nrSamples = 0.0;

	// constant loop bounds/increments are required for GLSL ES 1.0 unrolling
	for (float phi = 0.0; phi < 6.283185; phi += 0.393) {       // ~16 steps
		for (float theta = 0.0; theta < 1.570796; theta += 0.196) { // ~8 steps
			// spherical -> cartesian in tangent space
			vec3 tangentSample = vec3(sin(theta) * cos(phi), sin(theta) * sin(phi), cos(theta));
			// tangent space -> world
			vec3 sampleVec = tangentSample.x * right + tangentSample.y * up + tangentSample.z * N;

			irradiance += textureCube(envMap, sampleVec).rgb * cos(theta) * sin(theta);
			nrSamples += 1.0;
		}
	}

	irradiance = PI * irradiance * (1.0 / nrSamples);

	gl_FragColor = vec4(irradiance, 1.0);
}
