
precision mediump float;

struct BoundingBox {
	vec3 min;
	vec3 max;
	vec3 origin;
};

struct Light {
	vec3 pos;
	vec3 color;
};


uniform vec3 cameraLoc;
uniform vec3 sundir;
uniform vec3 sunlight;
uniform vec3 color;
uniform vec2 texTiling;
uniform float opacity;

// distance (depth) fog — blends distant geometry toward fogColor
uniform bool hasFog;
uniform vec3 fogColor;
uniform float fogNear;   // distance at which fog begins
uniform float fogFar;    // distance at which fog is fully opaque

uniform float glossy;
uniform float roughness;
uniform float metallic;
uniform float emission;
uniform float refraction;
uniform float normalMipmap;
uniform float normalIntensity;

// PBR material maps (glTF metallic-roughness workflow)
uniform bool hasMetalRoughMap;   // G = roughness, B = metallic
uniform bool hasAOMap;           // R = ambient occlusion
uniform bool hasEmissiveMap;
uniform vec3 emissiveColor;      // emissiveFactor (black = disabled)
uniform sampler2D metalRoughMap;
uniform sampler2D aoMap;
uniform sampler2D emissiveMap;

// image-based lighting (IBL)
uniform bool hasIBL;
uniform bool useDirectSun;
uniform float iblIntensity;
uniform float maxEnvLod;
uniform float exposure;
uniform vec3 iblColor;       // white-balance tint for the diffuse ambient
uniform vec3 ambientColor;   // constant indirect-diffuse irradiance (SimpleSky)
uniform samplerCube irradianceMap;

uniform bool receiveLight;
uniform bool hasNormalMap;
uniform bool receiveShadow;
uniform int refMapType;
uniform int shadowMapType;
uniform float shadowIntensity;

// cloud shadow: sun-POV transmittance map projected onto the scene
uniform bool hasCloudShadow;
uniform sampler2D cloudShadowMap;
uniform float cloudShadowDensity;     // transmittance = exp(-density * tau)
uniform float cloudShadowIntensity;   // 0 = off .. 1 = full shadow

uniform sampler2D texture;
uniform sampler2D normalMap;
uniform sampler2D lightMap;
uniform sampler2D shadowMap2D;
uniform samplerCube refMap;
uniform samplerCube shadowMap;

varying vec3 vertex;
varying vec3 normal;
varying vec2 texcoord1;
varying vec2 texcoord2;
varying vec3 vcolor;
varying highp vec3 shadowPosition;
varying highp vec2 cloudShadowUV;
varying mat3 TBN;

// Sun transmittance through the cloud layer at this fragment (1 = full sun,
// toward 0 under thick cloud). Returns 1 outside the cloud map footprint.
float cloudSunTransmittance() {
	if (!hasCloudShadow) return 1.0;
	if (cloudShadowUV.x < 0.0 || cloudShadowUV.x > 1.0
		|| cloudShadowUV.y < 0.0 || cloudShadowUV.y > 1.0) return 1.0;
	float tau = texture2D(cloudShadowMap, cloudShadowUV).r;
	float T = exp(-cloudShadowDensity * tau);
	return mix(1.0, T, cloudShadowIntensity);
}

#define MAX_LIGHT_COUNT 10
uniform int lightCount;
uniform Light lights[MAX_LIGHT_COUNT];

// light-probe irradiance volume (SH L2). probeSH holds 9 coefficients (RGB)
// per probe; the shader trilinearly blends nearby probes by a tent kernel.
#define MAX_PROBES 32
#define PROBE_SH_COUNT 9
uniform bool hasProbes;
uniform int probeCount;
uniform vec3 probePos[MAX_PROBES];
uniform vec3 probeSH[MAX_PROBES * PROBE_SH_COUNT];
uniform vec3 probeCell;       // grid spacing, for the tent blend weight
uniform float probeIntensity;

vec3 evalProbeIrradiance(vec3 N, vec3 wpos) {
	// 9 real SH L2 basis functions evaluated for the surface normal.
	float b[PROBE_SH_COUNT];
	b[0] = 0.282095;
	b[1] = 0.488603 * N.y;
	b[2] = 0.488603 * N.z;
	b[3] = 0.488603 * N.x;
	b[4] = 1.092548 * N.x * N.y;
	b[5] = 1.092548 * N.y * N.z;
	b[6] = 0.315392 * (3.0 * N.z * N.z - 1.0);
	b[7] = 1.092548 * N.x * N.z;
	b[8] = 0.546274 * (N.x * N.x - N.y * N.y);

	vec3 acc = vec3(0.0);
	float wsum = 0.0;

	for (int i = 0; i < MAX_PROBES; i++) {
		if (i >= probeCount) break;

		vec3 dist = abs(wpos - probePos[i]) / probeCell;
		vec3 tent = max(vec3(0.0), 1.0 - dist);
		float w = tent.x * tent.y * tent.z;
		if (w <= 0.0) continue;

		vec3 e = vec3(0.0);
		for (int k = 0; k < PROBE_SH_COUNT; k++) {
			e += probeSH[i * PROBE_SH_COUNT + k] * b[k];
		}

		acc += max(e, vec3(0.0)) * w;
		wsum += w;
	}

	if (wsum > 0.0) acc /= wsum;
	return acc;
}

struct LightReturn {
	vec3 diff;
	vec3 spec;
};

uniform BoundingBox refMapBox;
uniform BoundingBox shadowMapBox;

vec3 correctBoundingBoxIntersect(BoundingBox bbox, vec3 dir) {
	vec3 invdir = vec3(1.0, 1.0, 1.0) / dir;
	vec3 intersectMaxPointPlanes = (bbox.max - vertex) * invdir;
	vec3 intersectMinPointPlanes = (bbox.min - vertex) * invdir;
	vec3 largestRayParams = max(intersectMaxPointPlanes, intersectMinPointPlanes);
	float dist = min(min(largestRayParams.x, largestRayParams.y), largestRayParams.z);
	vec3 intersectPosition = vertex + dir * dist;
	return intersectPosition - bbox.origin;
}

float decodeFloatRGBA(vec4 rgba) {
  return dot(rgba, vec4(1.0, 1.0/255.0, 1.0/65025.0, 1.0/16581375.0));
}

vec3 refract2(vec3 d, vec3 normal, float r) {
	vec3 nl = dot(d, normal) < 0.0 ? normal : -normal;
	bool into = dot(nl, normal) > 0.0;
	if (into) r = 1.0 / r;
	
	float c = dot(d, nl);
	float t = 1.0 - r * r * (1.0 - c * c);
	
	if (t < 0.0) {
		return reflect(d, normal);
	}
	
	return normalize(d * r - normal * ((into ? 1.0 : -1.0) * (c * r + sqrt(t))));
}

vec3 fresnelSchlickRoughness(float cosTheta, vec3 F0, float rough) {
	return F0 + (max(vec3(1.0 - rough), F0) - F0) * pow(1.0 - cosTheta, 5.0);
}

#define PI 3.14159265359

vec3 fresnelSchlick(float cosTheta, vec3 F0) {
	return F0 + (1.0 - F0) * pow(1.0 - cosTheta, 5.0);
}

// GGX / Trowbridge-Reitz normal distribution
float distributionGGX(float NdotH, float rough) {
	float a = rough * rough;
	float a2 = a * a;
	float d = NdotH * NdotH * (a2 - 1.0) + 1.0;
	return a2 / max(PI * d * d, 1.0e-7);
}

// Smith geometry with Schlick-GGX, direct-light k
float geometrySmith(float NdotV, float NdotL, float rough) {
	float r = rough + 1.0;
	float k = (r * r) / 8.0;
	float gV = NdotV / (NdotV * (1.0 - k) + k);
	float gL = NdotL / (NdotL * (1.0 - k) + k);
	return gV * gL;
}

// Cook-Torrance BRDF for a single analytic light. Returns outgoing radiance
// (diffuse + specular) already weighted by N·L and incoming radiance.
vec3 cookTorrance(vec3 N, vec3 V, vec3 L, vec3 radiance, vec3 albedo,
	float rough, float metal, vec3 F0) {
	vec3 H = normalize(V + L);
	float NdotV = max(dot(N, V), 1.0e-4);
	float NdotL = max(dot(N, L), 0.0);
	float NdotH = max(dot(N, H), 0.0);
	float HdotV = max(dot(H, V), 0.0);

	float D = distributionGGX(NdotH, rough);
	float G = geometrySmith(NdotV, NdotL, rough);
	vec3  F = fresnelSchlick(HdotV, F0);

	vec3 specular = (D * G * F) / max(4.0 * NdotV * NdotL, 1.0e-4);

	// energy conservation: diffuse only from non-reflected, non-metal light
	vec3 kD = (vec3(1.0) - F) * (1.0 - metal);

	return (kD * albedo / PI + specular) * radiance * NdotL;
}

// Karis' analytic environment BRDF approximation (UE4 mobile). Replaces the
// split-sum BRDF integration LUT: returns (scale, bias) so that the specular
// term is prefiltered * (F0 * scale + bias).
vec2 envBRDFApprox(float NoV, float rough) {
	const vec4 c0 = vec4(-1.0, -0.0275, -0.572, 0.022);
	const vec4 c1 = vec4(1.0, 0.0425, 1.04, -0.04);
	vec4 r = rough * c0 + c1;
	float a004 = min(r.x * r.x, exp2(-9.28 * NoV)) * r.x + r.y;
	return vec2(-1.04, 1.04) * a004 + r.zw;
}

// Exposure-based exponential tone mapping. Near-identity for low values (so
// dark scenes are preserved) and smoothly rolls HDR highlights down to 1.0
// instead of hard-clipping them to white.
vec3 tonemap(vec3 hdr) {
	return vec3(1.0) - exp(-hdr * exposure);
}

void main(void) {

	vec2 uv1 = texcoord1 * texTiling;
	vec4 textureColor = texture2D(texture, uv1);

	float alpha = opacity * textureColor.a;
	if (alpha < 0.01){
		discard;
	}

	//////////////// NormalMap ////////////////

	vec3 vertexNormal = normal, normalmapValue = texture2D(normalMap, uv1, normalMipmap).rgb;

	if (hasNormalMap) {
		vertexNormal = normalize(TBN * (normalmapValue * 2.0 - 1.0) * vec3(normalIntensity, normalIntensity, 1.0));
	}

	vec3 cameraRay = vertex - cameraLoc;
	vec3 cameraNormal = normalize(cameraRay);
	vec3 finalColor = color * textureColor.rgb;

	//////////////// LightMap ////////////////

	vec3 lightmapColor = texture2D(lightMap, texcoord2).rgb;
	finalColor *= lightmapColor;

	vec3 albedo = finalColor;

	//////////////// PBR material maps (metallic-roughness) ////////////////

	float matRoughness = roughness;
	float matMetallic = metallic;
	if (hasMetalRoughMap) {
		vec3 mr = texture2D(metalRoughMap, uv1).rgb;
		matRoughness *= mr.g;
		matMetallic *= mr.b;
	}
	matRoughness = clamp(matRoughness, 0.04, 1.0);

	float ao = 1.0;
	if (hasAOMap) {
		ao = texture2D(aoMap, uv1).r;
	}

	//////////////// Lighting (unified PBR: direct + indirect) ////////////////
	// One physically-based path for every object (see docs/RENDERING.md §2).
	// Direct = sun + analytic point lights (Cook-Torrance). Indirect = a single
	// environment model: diffuse from light probes (GI) where present, else the
	// baked IBL irradiance; specular always from the prefiltered environment
	// cubemap. There is no separate non-IBL fallback path.

	vec3 N = vertexNormal;
	vec3 viewDir = -cameraNormal;                  // fragment -> eye
	float NdotV = max(dot(N, viewDir), 1.0e-4);
	vec3 F0 = mix(vec3(0.04), albedo, matMetallic);
	float cloudT = cloudSunTransmittance();

	// --- direct lights (sun + analytic point lights) ---
	vec3 direct = vec3(0.0);
	if (receiveLight) {
		if (useDirectSun) {
			// the sun is what the clouds occlude; scale its contribution by the
			// projected cloud transmittance so the gaps cast bright dappled light
			direct += cookTorrance(N, viewDir, sundir, sunlight, albedo, matRoughness, matMetallic, F0) * cloudT;
		}

		for (int i = 0; i < MAX_LIGHT_COUNT; i++) {
			if (i >= lightCount) break;
			vec3 lightRay = lights[i].pos - vertex;
			float ld = length(lightRay);
			vec3 L = lightRay / max(ld, 1.0e-4);
			vec3 radiance = lights[i].color / (1.0 + ld * ld);  // inverse-square falloff
			direct += cookTorrance(N, viewDir, L, radiance, albedo, matRoughness, matMetallic, F0);
		}
	}

	// --- indirect: one Fresnel splits diffuse/specular for the environment too ---
	vec3 F = fresnelSchlickRoughness(NdotV, F0, matRoughness);
	vec3 kD = (1.0 - F) * (1.0 - matMetallic);

	// indirect diffuse — a SINGLE term: light-probe GI where probes exist,
	// otherwise the baked IBL irradiance. Probes are baked including the
	// environment, so adding both would double-count.
	vec3 indirectDiffuse = vec3(0.0);
	if (hasProbes) {
		indirectDiffuse = kD * albedo * evalProbeIrradiance(N, vertex) * probeIntensity;
	} else if (hasIBL) {
		indirectDiffuse = kD * albedo * textureCube(irradianceMap, N).rgb * iblColor * iblIntensity;
	} else {
		// no probes, no baked IBL: constant-colour environment (SimpleSky) — a
		// uniform-radiance environment, so every scene has ambient fill.
		indirectDiffuse = kD * albedo * ambientColor;
	}

	// indirect specular — prefiltered environment cubemap (per-object refMap or
	// the scene environment) weighted by the analytic environment BRDF.
	vec3 indirectSpecular = vec3(0.0);
	if (refMapType > 0) {
		vec3 R = reflect(cameraNormal, N);
		if (refMapType == 2) {
			R = normalize(correctBoundingBoxIntersect(refMapBox, R));
		}
		// Flip X to match the skybox sampling convention (panorama.vert negates
		// texcoord.x) so reflections line up left-right with the visible sky.
		R.x = -R.x;
		vec3 prefiltered = textureCube(refMap, R, matRoughness * maxEnvLod).rgb;
		vec2 ab = envBRDFApprox(NdotV, matRoughness);
		indirectSpecular = prefiltered * (F0 * ab.x + ab.y) * iblIntensity;
	}

	// indirect light is what AO occludes; direct light is not. Ambient also
	// fades partially under cloud cover (weaker than the full sun attenuation).
	vec3 ambient = (indirectDiffuse + indirectSpecular) * ao * mix(1.0, cloudT, 0.4);

	finalColor = direct + ambient;

	// //////////////// ShadowMap ////////////////

	if (receiveShadow) {
		if (shadowMapType == 1) {
			float shadowDir = dot(vertexNormal, normalize(vec3(2.0, 10.0, 5.0)));

			// Only fragments inside the shadow map's orthographic frustum have
			// valid occluder data. Outside it (large grounds where the surface
			// runs past the configured scale/viewDepth) shadowPosition leaves the
			// [0,1] cube, and a naive compare reads "always in shadow" — painting a
			// false diagonal half-shadow along the light's depth axis. Skip those.
			bool inShadowFrustum =
				shadowPosition.x >= 0.0 && shadowPosition.x <= 1.0 &&
				shadowPosition.y >= 0.0 && shadowPosition.y <= 1.0 &&
				shadowPosition.z >= 0.0 && shadowPosition.z <= 1.0;

			if (shadowDir > 0.0 && inShadowFrustum) {

				// Slope-scaled depth bias. The shadow map stores depth at only 8-bit
				// precision, so without a bias a flat lit surface shadows itself
				// ("acne") wherever its interpolated depth crosses a quantization
				// step — which shows up as a diagonal half-shadow on a single panel.
				// The bias grows at grazing sun angles, where the per-texel depth
				// gradient (and thus the error) is largest.
				float bias = max(0.008 * (1.0 - dot(vertexNormal, sundir)), 0.003);

				float shadowMapDepth = texture2D(shadowMap2D, shadowPosition.xy).r;

				// 0 = lit, 1 = fully occluded. Shadows only ever *darken* the
				// surface; lit fragments are left untouched so the shadow-frustum
				// edge is seamless (no bright patch where the frustum ends). The
				// darkening amount matches the previous formula's shadowed case.
				float shadow = smoothstep(0.0, 0.05, shadowPosition.z - shadowMapDepth - bias);
				finalColor *= (1.0 - shadow * shadowIntensity);
			}
		} else if (shadowMapType == 2) {
			vec3 correctedVertexToSun = vec3(0.0);
			correctedVertexToSun = correctBoundingBoxIntersect(shadowMapBox, sundir);

			float shadowBlock = textureCube(shadowMap, correctedVertexToSun).r;
			shadowBlock *= max(dot(normal, sundir), 0.0);
			finalColor += vec3(1.0, 1.0, 0.9) * shadowBlock;
		}
	}

	//////////////// Emissive (PBR self-illumination) ////////////////

	// `emission` is a scalar HDR multiplier on the material's base colour: it
	// adds self-illumination on top of the lit result, so emission = 1 glows at
	// roughly surface brightness and large values (e.g. 1000) push the fragment
	// far above the [0,1] display range. With a floating-point scene target that
	// energy survives to feed the bright-pass bloom and the final tonemap,
	// instead of clamping to white. emissiveColor / emissiveMap is the separate
	// glTF emissive channel and is always added.
	finalColor += albedo * emission;

	vec3 emissive = emissiveColor;
	if (hasEmissiveMap) {
		emissive *= texture2D(emissiveMap, uv1).rgb;
	}
	finalColor += emissive;

	// NOTE: tonemapping is no longer done per-fragment. The scene is rendered
	// into a linear HDR (RGBA16F) target and tonemapped once in the final
	// screen pass, after bloom is composited. (The `tonemap` helper is kept for
	// reference / non-postprocess paths.)

	//////////////// Distance fog ////////////////
	// applied last, in display space, so distant geometry fades into the
	// background / sky colour

	if (hasFog) {
		float fogDist = length(cameraRay);
		float fogAmount = clamp((fogDist - fogNear) / max(fogFar - fogNear, 1.0e-4), 0.0, 1.0);
		finalColor = mix(finalColor, fogColor, fogAmount);
	}

	gl_FragColor = vec4(finalColor, alpha);
	//  gl_FragColor.rgb *= gl_FragColor.a;
}