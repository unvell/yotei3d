
attribute vec3 vertexPosition;
attribute vec3 vertexNormal;

uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;
uniform mat4 normalMatrix;

varying vec3 vNormal;
varying float vViewZ;

void main(void) {
  vNormal = (normalMatrix * vec4(vertexNormal, 0.0)).xyz;

  vec4 viewPos = modelViewMatrix * vec4(vertexPosition, 1.0);
  vViewZ = viewPos.z;

  gl_Position = projectionMatrix * viewPos;
}
