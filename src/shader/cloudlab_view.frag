#version 300 es

// ============================================================================
//  雲ビューア — レイマーチ（Beer 則・密度のみ）。P1 ではここは触らなくて OK。
// ============================================================================
// ベイク済みの密度3Dテクスチャ(uVolume)を、視線に沿って積分して表示します。
// 物理は Beer-Lambert の透過率 T = exp(-Σ σ·Δs) だけ。ライティングは無し。
// 雲ボックスに当たらないピクセルは空のグラデーションを出します。
//
//   P2 でこのマーチ（透過の積分）を、P3 で散乱ライティング（太陽マーチ・
//   位相関数）を学ぶときに、このファイルを育てていきます。
// ============================================================================

precision highp float;
precision highp sampler3D;

in vec2 vNdc;
out vec4 fragColor;

uniform mat4  uInvViewProj;   // clip -> world
uniform vec3  uCameraPos;
uniform vec3  uBoxMin;        // 雲ボックスのワールド AABB（cell[0,1]^3 の対応箱）
uniform vec3  uBoxMax;
uniform sampler3D uVolume;    // ベイクした密度（.r）
uniform float uSigma;         // 消散係数スケール（雲の濃さ）
uniform int   uSteps;         // 視線方向のサンプル数
uniform vec3  uColorBase;     // 雲の下側の淡い色
uniform vec3  uColorTop;      // 雲の上側の色
uniform vec3  uSkyTop;        // 背景の空：上
uniform vec3  uSkyBottom;     // 背景の空：下

// レイ vs 軸並行ボックス（slab 法）。戻り値 x=tEnter, y=tExit。
// 当たらない/箱の後ろなら x >= y。
vec2 intersectBox(vec3 ro, vec3 rd, vec3 bmin, vec3 bmax) {
	vec3 inv = 1.0 / rd;
	vec3 ta = (bmin - ro) * inv;
	vec3 tb = (bmax - ro) * inv;
	vec3 tmin = min(ta, tb);
	vec3 tmax = max(ta, tb);
	float tEnter = max(max(tmin.x, tmin.y), tmin.z);
	float tExit  = min(min(tmax.x, tmax.y), tmax.z);
	return vec2(tEnter, tExit);
}

void main(void) {
	// --- 視線レイをワールド空間で復元（NDC -> world）---
	vec4 nearW = uInvViewProj * vec4(vNdc, -1.0, 1.0);
	vec4 farW  = uInvViewProj * vec4(vNdc,  1.0, 1.0);
	nearW /= nearW.w;
	farW  /= farW.w;
	vec3 ro = uCameraPos;
	vec3 rd = normalize(farW.xyz - nearW.xyz);

	// 背景の空（視線の仰角で上下グラデ）
	vec3 sky = mix(uSkyBottom, uSkyTop, clamp(rd.y * 0.5 + 0.5, 0.0, 1.0));

	// --- レイ vs 雲ボックス ---
	vec2 tHit = intersectBox(ro, rd, uBoxMin, uBoxMax);
	float tEnter = max(tHit.x, 0.0);
	float tExit  = tHit.y;
	if (tExit <= tEnter) { fragColor = vec4(sky, 1.0); return; }   // 箱に当たらない

	// --- 区間を等間隔に刻んで Beer 則で積分 ---
	float dt = (tExit - tEnter) / float(uSteps);
	// バンディング除けのディザ（開始位置を 1 ステップ未満だけずらす）
	float ign = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
	float t = tEnter + dt * ign;

	vec3  boxSize = uBoxMax - uBoxMin;
	float transmittance = 1.0;   // T：手前からの累積透過率
	vec3  color = vec3(0.0);     // 積み上げる雲色（乗算済み）

	for (int i = 0; i < 256; i++) {
		if (i >= uSteps || transmittance < 0.01) break;   // 不透明になったら打ち切り

		vec3 p = ro + rd * t;
		vec3 cell = (p - uBoxMin) / boxSize;     // world -> [0,1]^3
		float d = texture(uVolume, cell).r;      // 補間付きの密度フェッチ

		if (d > 0.0) {
			float segT = exp(-d * uSigma * dt);  // このセグメントの透過率
			vec3  tint = mix(uColorBase, uColorTop, cell.y);  // 高さで淡く色付け
			// front-to-back 合成：(1-segT) はこの区間で遮られた割合
			color += transmittance * (1.0 - segT) * tint;
			transmittance *= segT;
		}
		t += dt;
	}

	// 残った透過率の分だけ背景の空が透ける（雲を空の上に合成）
	vec3 outc = color + transmittance * sky;
	fragColor = vec4(outc, 1.0);
}
