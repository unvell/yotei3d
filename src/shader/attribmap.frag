
precision highp float;

uniform int type;

varying vec3 vNormal;

void main(void) {
  vec3 value;

  // depth
  if (type == 0) {
    value = vec3(gl_FragCoord.z);

  // normal
  } else if (type == 1) {
    value = normalize(vNormal) * 0.5 + 0.5;
  }

  gl_FragColor = vec4(value, 1.0);
}
