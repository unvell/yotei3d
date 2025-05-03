
attribute vec3 vertexPosition;
attribute vec3 vertexNormal;

//uniform mat4 projectionMatrix;
uniform mat4 projectionViewMatrix;
//uniform mat4 modelMatrix;
uniform mat4 normalMatrix;
uniform int type;

varying vec3 value;

void main(void) {
  vec4 position = projectionViewMatrix * vec4(vertexPosition, 1.0);

  // depth
  if (type == 0) {
    value = vec3(0.5 + (position.z / position.w) * 0.5);

  // normal
  } else if (type == 1) {
    value = (normalize((normalMatrix * vec4(vertexNormal, 0)).xyz) + 1.0) * 0.5;
  }
  
  gl_Position = position;
}
