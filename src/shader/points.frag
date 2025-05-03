
precision mediump float;

varying vec4 color;

void main(void) {
  vec2 coord = gl_PointCoord - vec2(0.5);
  float dist = length(coord) * 2.0;

  if (dist > 1.0) discard;

  float alpha = (1.0 - dist) * color.a;

  gl_FragColor = vec4(color.rgb, alpha);
}