
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

uniform float glossy;
uniform float roughness;
uniform float metallic;
uniform float emission;
uniform float refraction;
uniform float normalMipmap;
uniform float normalIntensity;

// image-based lighting (IBL)
uniform bool hasIBL;
uniform bool useDirectSun;
uniform float iblIntensity;
uniform float maxEnvLod;
uniform float exposure;
uniform vec3 iblColor;       // white-balance tint for the diffuse ambient
uniform samplerCube irradianceMap;

uniform bool receiveLight;
uniform bool hasNormalMap;
uniform bool receiveShadow;
uniform int refMapType;
uniform int shadowMapType;
uniform float shadowIntensity;

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
varying mat3 TBN;

#define MAX_LIGHT_COUNT 10
uniform int lightCount;
uniform Light lights[MAX_LIGHT_COUNT];

// light-probe irradiance volume (SH L1). probeSH holds 4 coefficients (RGB)
// per probe; the shader trilinearly blends nearby probes by a tent kernel.
#define MAX_PROBES 32
uniform bool hasProbes;
uniform int probeCount;
uniform vec3 probePos[MAX_PROBES];
uniform vec3 probeSH[MAX_PROBES * 4];
uniform vec3 probeCell;       // grid spacing, for the tent blend weight
uniform float probeIntensity;

vec3 evalProbeIrradiance(vec3 N, vec3 wpos) {
	vec4 shBasis = vec4(0.282095, 0.488603 * N.y, 0.488603 * N.z, 0.488603 * N.x);

	vec3 acc = vec3(0.0);
	float wsum = 0.0;

	for (int i = 0; i < MAX_PROBES; i++) {
		if (i >= probeCount) break;

		vec3 dist = abs(wpos - probePos[i]) / probeCell;
		vec3 tent = max(vec3(0.0), 1.0 - dist);
		float w = tent.x * tent.y * tent.z;
		if (w <= 0.0) continue;

		vec3 e = probeSH[i * 4 + 0] * shBasis.x
		       + probeSH[i * 4 + 1] * shBasis.y
		       + probeSH[i * 4 + 2] * shBasis.z
		       + probeSH[i * 4 + 3] * shBasis.w;

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

vec3 traceLight(vec3 vertexNormal, vec3 cameraNormal) {

	vec3 diff = vec3(0.0);
	vec3 specular = vec3(0.0);

	for (int i = 0; i < MAX_LIGHT_COUNT; i++) {
		if (i >= lightCount) break;

		vec3 lightRay = lights[i].pos - vertex;
		vec3 lightNormal = normalize(lightRay);

		float ln = dot(lightNormal, vertexNormal);
		float ld = length(lightRay);
		float lda = pow(2.718282, -ld);
		diff += lights[i].color * max(ln * lda, 0.0);

		vec3 lightReflection = reflect(lightNormal, vertexNormal);
		float refd = max(dot(lightReflection, cameraNormal), 0.0);
		float sf = pow(refd, pow(glossy, -2.0)) * (1.0 / ld);
		specular += lights[i].color * sf * glossy;
	}

	return diff + specular;
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

	if (emission > 0.0) {
		gl_FragColor = vec4(normalize(color) * 1.5, opacity);
		return;
	}

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

	if (hasIBL) {

		//////////////// IBL (split-sum approximation) ////////////////

		vec3 N = vertexNormal;
		vec3 viewDir = -cameraNormal;                  // fragment -> eye
		float NdotV = max(dot(N, viewDir), 1.0e-4);

		vec3 F0 = mix(vec3(0.04), albedo, metallic);

		// direct lighting (additive). The analytic sun is only added when scene
		// lighting is enabled; for IBL-only scenes the environment map already
		// carries the key light, so adding it again would double-count.
		vec3 direct = vec3(0.0);
		if (receiveLight) {
			if (useDirectSun) {
				float NdotL = max(dot(N, sundir), 0.0);
				direct += albedo * sunlight * NdotL;
			}

			if (lightCount > 0) {
				direct += traceLight(N, cameraNormal);
			}
		}

		// diffuse ambient from the baked irradiance map
		vec3 F = fresnelSchlickRoughness(NdotV, F0, roughness);
		vec3 kD = (1.0 - F) * (1.0 - metallic);
		vec3 irradiance = textureCube(irradianceMap, N).rgb * iblColor;
		vec3 diffuseIBL = irradiance * albedo;

		// specular ambient: environment cubemap sampled at a roughness-driven
		// mip, weighted by the analytic environment BRDF
		vec3 R = reflect(cameraNormal, N);
		if (refMapType == 2) {
			R = normalize(correctBoundingBoxIntersect(refMapBox, R));
		}
		vec3 prefiltered = textureCube(refMap, R, roughness * maxEnvLod).rgb;
		vec2 ab = envBRDFApprox(NdotV, roughness);
		vec3 specularIBL = prefiltered * (F0 * ab.x + ab.y);

		vec3 ambient = (kD * diffuseIBL + specularIBL) * iblIntensity;

		finalColor = direct + ambient;

	} else {

		//////////////// Lights (legacy non-IBL path) ////////////////

		if (receiveLight) {
			if (lightCount > 0 || glossy > 0.0) {
				finalColor += traceLight(vertexNormal, cameraNormal);
			}

			float vtos = clamp(dot(vertexNormal, sundir), 0.0, 1.0);
			finalColor = finalColor * 0.75 + finalColor * (vtos * 0.25);
			finalColor *= sunlight;
		}

		//////////////// RefMap ////////////////
		float roughdelta = pow(roughness, 10.0);

		vec3 refmapLookup = reflect(cameraNormal, vertexNormal);

		if (refMapType == 2) {
			refmapLookup = normalize(correctBoundingBoxIntersect(refMapBox, refmapLookup));
		}

		if (glossy > 0.0) {
			vec3 refColor = textureCube(refMap, refmapLookup, roughdelta).rgb;
			finalColor = finalColor * (1.0 - glossy) + finalColor * refColor * glossy;
		}

		//////////////// RefraMap ////////////////

		if (refraction > 0.0) {
			vec3 refraLookup = refract2(vec3(-cameraNormal.x, cameraNormal.y, cameraNormal.z), vertexNormal, 1.05);
			vec3 refraColor = textureCube(refMap, refraLookup, roughdelta).rgb;
			finalColor = finalColor * (1.0 - refraction) + finalColor * refraColor * refraction;
		}
	}

	// //////////////// Light-probe indirect diffuse ////////////////

	if (hasProbes) {
		vec3 probeIrradiance = evalProbeIrradiance(vertexNormal, vertex);
		finalColor += albedo * probeIrradiance * probeIntensity;
	}

	// //////////////// ShadowMap ////////////////

	if (receiveShadow) {
		if (shadowMapType == 1) {
			float shadowDir = dot(vertexNormal, normalize(vec3(2.0, 10.0, 5.0)));
			if (shadowDir > 0.0) {

        //float bias = max(0.005 * (1.0 - dot(normal, sundir)), 0.0005);
				// shadowMapDepth = decodeFloatRGBA(texture2D(shadowMap2D, shadowPosition.xy));
				float shadowMapDepth = texture2D(shadowMap2D, shadowPosition.xy).r;

				//float shadowBlock = 1.0 - smoothstep(0.00001, 0.05, (shadowPosition.z - shadowMapDepth)) / 0.5;
        float shadowBlock = 1.0 - smoothstep(0.0, 0.05, (shadowPosition.z - shadowMapDepth)) / 0.5;
				finalColor = finalColor + finalColor * shadowBlock * shadowIntensity;
			}
		} else if (shadowMapType == 2) {
			vec3 correctedVertexToSun = vec3(0.0);
			correctedVertexToSun = correctBoundingBoxIntersect(shadowMapBox, sundir);

			float shadowBlock = textureCube(shadowMap, correctedVertexToSun).r;
			shadowBlock *= max(dot(normal, sundir), 0.0);
			finalColor += vec3(1.0, 1.0, 0.9) * shadowBlock;
		}
	}

	if (hasIBL) {
		finalColor = tonemap(finalColor);
	}

	gl_FragColor = vec4(finalColor, alpha);
	//  gl_FragColor.rgb *= gl_FragColor.a;
}