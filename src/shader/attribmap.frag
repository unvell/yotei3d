
precision highp float;

varying vec3 value;

void main(void) {
  gl_FragColor = vec4(value, 1.0);
}