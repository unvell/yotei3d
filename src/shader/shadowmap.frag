
precision highp float;

varying float depth;

vec4 encodeFloatRGBA(float v) {
  vec4 enc = vec4(1.0, 255.0, 65025.0, 16581375.0) * v;
  enc = fract(enc);
  enc -= enc.yzww * vec4(1.0 / 255.0, 1.0 / 255.0, 1.0 / 255.0, 0.0);
  return enc;
}

float decodeFloatRGBA(vec4 rgba) {
  return dot(rgba, vec4(1.0, 1.0 / 255.0, 1.0 / 65025.0, 1.0 / 16581375.0));
}

void main(void) {
  float d = depth;
  gl_FragColor = vec4(d, d, d, 1.0);
  // gl_FragColor = encodeFloatRGBA(depth);
}