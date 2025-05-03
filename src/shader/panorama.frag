
precision mediump float;

uniform samplerCube texture;
uniform vec3 color;
varying vec3 texcoord;

void main(void) {

	vec3 fcolor = textureCube(texture, texcoord).rgb * color;

	gl_FragColor = vec4(fcolor, 1.0);
}