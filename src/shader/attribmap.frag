
precision highp float;

uniform int type;
uniform float uNear;
uniform float uFar;

varying vec3 vNormal;
varying float vViewZ;

// Pack a float in [0,1] across all 4 channels for ~32-bit precision.
vec4 packDepth(float v) {
  vec4 enc = vec4(1.0, 255.0, 65025.0, 16581375.0) * v;
  enc = fract(enc);
  enc -= enc.yzww * vec4(1.0 / 255.0, 1.0 / 255.0, 1.0 / 255.0, 0.0);
  return enc;
}

void main(void) {
  // depth: linearize view-space Z to [0,1] over [near, far] then RGBA-pack
  if (type == 0) {
    float linearDepth = clamp((-vViewZ - uNear) / (uFar - uNear), 0.0, 1.0);
    gl_FragColor = packDepth(linearDepth);

  // normal
  } else if (type == 1) {
    gl_FragColor = vec4(normalize(vNormal) * 0.5 + 0.5, 1.0);
  }
}
