precision highp float;

uniform vec3 color;
uniform vec3 sundir;
uniform vec3 sunlight;
uniform float ambient;

uniform bool hasTexture;
uniform sampler2D tex;
uniform bool hasVertexColor;

uniform bool hasFog;
uniform vec3 fogColor;
uniform float fogNear;
uniform float fogFar;
uniform vec3 cameraLoc;

varying vec3 vNormal;
varying vec2 vTexcoord;
varying vec3 vColor;
varying vec3 vWorld;

void main(void) {
	vec3 base = color;

	if (hasTexture) {
		base *= texture2D(tex, vTexcoord).rgb;
	}

	if (hasVertexColor) {
		base *= vColor;
	}

	float ndl = max(dot(normalize(vNormal), normalize(sundir)), 0.0);
	vec3 lit = base * (sunlight * ndl + ambient);

	if (hasFog) {
		float dist = distance(cameraLoc, vWorld);
		float f = clamp((dist - fogNear) / (fogFar - fogNear), 0.0, 1.0);
		lit = mix(lit, fogColor, f);
	}

	gl_FragColor = vec4(lit, 1.0);
}
