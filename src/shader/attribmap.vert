
attribute vec3 vertexPosition;
attribute vec3 vertexNormal;

uniform mat4 projectionViewMatrix;
uniform mat4 normalMatrix;

varying vec3 vNormal;

void main(void) {
  vNormal = (normalMatrix * vec4(vertexNormal, 0.0)).xyz;
  gl_Position = projectionViewMatrix * vec4(vertexPosition, 1.0);
}
