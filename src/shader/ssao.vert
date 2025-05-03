precision mediump float;

attribute vec3 vertexPosition;
attribute vec2 vertexTexcoord;

uniform mat4 projectViewMatrix;
//uniform mat4 uProjection;

varying vec2 texcoord;

void main(void) {
  texcoord = vertexTexcoord;
  gl_Position = projectViewMatrix * vec4(vertexPosition, 1.0);
}