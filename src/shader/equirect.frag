
precision highp float;

// Equirectangular (lat-long) -> cubemap projection. Rendered once per cube
// face (via ibl.vert, which hands us the world-space direction `vDir` for each
// fragment) to convert a loaded HDR panorama into the cubemap the engine
// samples for image-based lighting and the skybox background.

uniform sampler2D equirectMap;

// Azimuth rotation of the environment about the vertical axis, in radians.
// Baked into the cubemap once, so the skybox background and every reflection /
// IBL term that samples the cubemap rotate together. 0 = unchanged.
uniform float yaw;

varying vec3 vDir;

const float INV_PI = 0.31830988618;   // 1 / PI
const float INV_2PI = 0.15915494309;  // 1 / (2*PI)

void main(void) {
	vec3 d = normalize(vDir);

	// direction -> lat-long uv. u wraps around the azimuth (atan2(z, x)), offset
	// by `yaw` to spin the panorama horizontally; WRAP_S = REPEAT makes the
	// wrap-around seamless. v maps the elevation; the side faces are oriented to
	// match this, so it is kept as the natural +asin (the +Y/-Y pole faces are
	// corrected in the per-face basis instead, see FACE_BASIS in iblbaker.js).
	float u = 0.5 + (atan(d.z, d.x) + yaw) * INV_2PI;
	float v = 0.5 + asin(clamp(d.y, -1.0, 1.0)) * INV_PI;

	gl_FragColor = vec4(texture2D(equirectMap, vec2(u, v)).rgb, 1.0);
}
