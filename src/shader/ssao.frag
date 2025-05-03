precision mediump float;

uniform sampler2D depthMap;
uniform sampler2D normalMap;

uniform mat4 uProjection;
uniform mat4 uInvProjection;
uniform vec3 uSamples[16];
uniform float radius;
uniform float bias;

varying vec2 texcoord;

vec3 getViewPos(vec2 uv, float depth) {
  float z = depth * 2.0 - 1.0;
  vec4 clipPos = vec4(uv * 2.0 - 1.0, z, 1.0);
  vec4 viewPos = uInvProjection * clipPos;
  return viewPos.xyz / viewPos.w;
}

void main() {

  float depth = texture2D(depthMap, texcoord).r;
  vec3 pos = getViewPos(texcoord, depth);
  vec3 normal = normalize(texture2D(normalMap, texcoord).xyz * 2.0 - 1.0);

  float occlusion = 0.0;
  const int sampleCount = 16;

  for (int i = 0; i < sampleCount; i++) {
    vec3 sampleVec = uSamples[i];

    vec3 tangent = normalize(sampleVec - normal * dot(sampleVec, normal));
    vec3 bitangent = normalize(cross(normal, tangent));
    mat3 TBN = mat3(tangent, bitangent, normal);

    vec3 samplePos = pos + TBN * sampleVec * radius;

    vec4 offset = uProjection * vec4(samplePos, 1.0);
    offset.xyz /= offset.w;
    vec2 sampleUV = offset.xy * 0.5 + 0.5;

    // skip out-of-bound samples
    if (sampleUV.x < 0.0 || sampleUV.x > 1.0 || sampleUV.y < 0.0 || sampleUV.y > 1.0)
      continue;

    float sampleDepth = texture2D(depthMap, sampleUV).r;
    vec3 sampleViewPos = getViewPos(sampleUV, sampleDepth);
    float rangeCheck = smoothstep(0.0, 1.0, radius / abs(pos.z - sampleViewPos.z));

    if ((sampleViewPos.z) > (samplePos.z + bias)) {
      occlusion += rangeCheck;
    }
  }

  occlusion = 1.0 - (occlusion / float(sampleCount));
  gl_FragColor = vec4(vec3(occlusion), 1.0);
}