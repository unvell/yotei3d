
precision highp float;

// Equirectangular (lat-long) -> cubemap projection. Rendered once per cube
// face (via ibl.vert, which hands us the world-space direction `vDir` for each
// fragment) to convert a loaded HDR panorama into the cubemap the engine
// samples for image-based lighting and the skybox background.

uniform sampler2D equirectMap;

varying vec3 vDir;

const float INV_PI = 0.31830988618;   // 1 / PI
const float INV_2PI = 0.15915494309;  // 1 / (2*PI)

void main(void) {
	vec3 d = normalize(vDir);

	// direction -> lat-long uv. u wraps around the azimuth (atan2(z, x)).
	// v: GL uploads the panorama's first scanline (the file's top row) to t=0,
	// so looking up (d.y = +1) must sample t=1 — hence +asin, not -asin.
	float u = 0.5 + atan(d.z, d.x) * INV_2PI;
	float v = 0.5 + asin(clamp(d.y, -1.0, 1.0)) * INV_PI;

	gl_FragColor = vec4(texture2D(equirectMap, vec2(u, v)).rgb, 1.0);
}
