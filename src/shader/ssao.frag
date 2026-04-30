precision highp float;

uniform sampler2D depthMap;
uniform sampler2D normalMap;

uniform mat4 uProjection;
uniform float uNear;
uniform float uFar;
uniform vec3 uSamples[16];
uniform float radius;
uniform float bias;

varying vec2 texcoord;

float unpackDepth(vec4 enc) {
  return dot(enc, vec4(1.0, 1.0 / 255.0, 1.0 / 65025.0, 1.0 / 16581375.0));
}

vec3 getViewPos(vec2 uv, float linearDepth) {
  // linearDepth: 0 at near, 1 at far. View-space Z is negative in front of camera.
  float viewZ = -(uNear + linearDepth * (uFar - uNear));
  vec2 ndc = uv * 2.0 - 1.0;
  return vec3(
    ndc.x * (-viewZ) / uProjection[0][0],
    ndc.y * (-viewZ) / uProjection[1][1],
    viewZ
  );
}

vec3 hashRandomVec(vec2 uv) {
  float a = fract(sin(dot(uv, vec2(12.9898, 78.233))) * 43758.5453);
  float b = fract(sin(dot(uv, vec2(39.3468, 11.1357))) * 24634.6345);
  return vec3(a * 2.0 - 1.0, b * 2.0 - 1.0, 0.0);
}

void main() {
  float linearDepth = unpackDepth(texture2D(depthMap, texcoord));

  // Skip background (depth at far plane).
  if (linearDepth >= 0.9999) {
    gl_FragColor = vec4(1.0);
    return;
  }

  vec3 pos = getViewPos(texcoord, linearDepth);
  vec3 normal = normalize(texture2D(normalMap, texcoord).xyz * 2.0 - 1.0);

  vec3 randomVec = hashRandomVec(texcoord);
  vec3 tangent   = normalize(randomVec - normal * dot(randomVec, normal));
  vec3 bitangent = cross(normal, tangent);
  mat3 TBN       = mat3(tangent, bitangent, normal);

  float occlusion = 0.0;
  const int sampleCount = 16;

  for (int i = 0; i < sampleCount; i++) {
    vec3 samplePos = pos + (TBN * uSamples[i]) * radius;

    vec4 offset = uProjection * vec4(samplePos, 1.0);
    offset.xyz /= offset.w;
    vec2 sampleUV = offset.xy * 0.5 + 0.5;

    if (sampleUV.x < 0.0 || sampleUV.x > 1.0 || sampleUV.y < 0.0 || sampleUV.y > 1.0)
      continue;

    float sampleLinearDepth = unpackDepth(texture2D(depthMap, sampleUV));
    vec3 sampleViewPos = getViewPos(sampleUV, sampleLinearDepth);
    float rangeCheck = smoothstep(0.0, 1.0, radius / abs(pos.z - sampleViewPos.z));

    if (sampleViewPos.z > samplePos.z + bias) {
      occlusion += rangeCheck;
    }
  }

  occlusion = 1.0 - (occlusion / float(sampleCount));
  gl_FragColor = vec4(vec3(occlusion), 1.0);
}
