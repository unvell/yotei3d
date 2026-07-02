#version 300 es

// ============================================================================
//  雲ビューア — レイマーチ＋単散乱ライティング
// ============================================================================
// ベイク済みの密度3Dテクスチャ(uVolume)を視線に沿って積分して表示します。
//   - 不透明度は Beer 則 T = exp(-Σσ·Δs)（P1 のまま）
//   - 各サンプルの「色」は lighting() が返す。★ここがあなたの育てる場所★
//     Step 1: 太陽マーチによる自己影（実装済み）
//     Step 2: 位相関数（HG）  Step 3: powder  Step 4: アンビエント ← あなたが追加
// ============================================================================

precision highp float;
precision highp sampler3D;

in vec2 vNdc;
out vec4 fragColor;

uniform mat4  uInvViewProj;   // clip -> world
uniform mat4  uInvModel;      // world -> volume-local（pivot 回転の逆）。雲を回す
uniform vec3  uCameraPos;
uniform vec3  uBoxMin;        // 雲ボックスのローカル AABB（cell[0,1]^3 の対応箱）
uniform vec3  uBoxMax;
uniform sampler3D uVolume;    // ベイクした密度（.r）
uniform float uSigma;         // 消散係数スケール（雲の濃さ）
uniform int   uSteps;         // 視線方向のサンプル数
uniform vec3  uSunDir;        // 太陽へ向かう方向（ワールド, 正規化済み）
uniform vec3  uSunColor;      // 太陽の放射（色×強さ）
uniform vec3  uColorBase;     // アンビエント下側（地面フィル）… Step 4 用
uniform vec3  uColorTop;      // アンビエント上側（天空フィル）… Step 4 用
uniform vec3  uSkyTop;        // 背景の空：上
uniform vec3  uSkyBottom;     // 背景の空：下

// ローカル空間の太陽方向。main() で uInvModel を掛けて設定する（雲が回ると
// 雲から見た太陽の向きも回るので、影も一緒に回る）。
vec3 gSunDirL;

// 任意のローカル座標での密度。箱の外は 0（CLAMP で端がにじむのを防ぐ）。
// view のマーチと太陽マーチの両方がこれを使う。
float densityAt(vec3 localP) {
	vec3 cell = (localP - uBoxMin) / (uBoxMax - uBoxMin);
	if (any(lessThan(cell, vec3(0.0))) || any(greaterThan(cell, vec3(1.0)))) return 0.0;
	return texture(uVolume, cell).r;
}

// --- Step 1: 太陽方向へ短くマーチして、その点に届く陽の割合を返す（自己影）---
// 点 p から太陽へ進みながら光学的厚み τ を積み、Beer 則で exp(-τ) を返す。
// 1.0 = 陽が完全に届く（雲の上面）、0.0 付近 = 分厚い雲に遮られた影。
float sunTransmittance(vec3 p) {
	const int SUN_STEPS = 8;
	float ls = (uBoxMax.x - uBoxMin.x) / float(SUN_STEPS);   // 太陽方向のステップ幅
	float tau = 0.0;
	for (int i = 0; i < SUN_STEPS; i++) {
		vec3 sp = p + gSunDirL * (ls * (float(i) + 0.5));
		tau += densityAt(sp) * uSigma * ls;
	}
	return exp(-tau);
}

// ============================================================================
//  ★ ここが「光」を育てる場所（density() の光版）★
//  p: ローカル空間のサンプル点, cell: [0,1]^3, d: この点の密度
//  返り値 = この点から目に向かって出ていく放射（＝見える色）
// ============================================================================
vec3 lighting(vec3 p, vec3 cell, float d) {
	// --- Step 1: 太陽の自己影のみ ---
	float sunT = sunTransmittance(p);      // 0=影, 1=陽が完全に届く
	vec3  radiance = uSunColor * sunT;

	// --- ここから下を足していく（次のはしご）---
	//  Step 2: 位相関数 HG で「太陽方向依存の散乱」→ 逆光の縁が光る
	//          float ph = hgPhase(dot(gViewDirL, gSunDirL), 0.6);  radiance *= ph; など
	//  Step 3: powder 項 (1 - exp(-d*k)) で縁の暗がり
	//  Step 4: 天空/地面アンビエント（影側の青いフィル）
	//          radiance += mix(uColorBase, uColorTop, cell.y);

	return radiance;
}

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

	// 背景の空（視線の仰角で上下グラデ）。空はワールド固定なので回さない。
	vec3 sky = mix(uSkyBottom, uSkyTop, clamp(rd.y * 0.5 + 0.5, 0.0, 1.0));

	// --- レイをボリュームのローカル空間へ変換（pivot の回転を雲に適用）---
	// uInvModel は world->local（pivot 回転の逆）。ボックス中心まわりで回したい
	// ので、中心を引いてから回転し、戻す。回転のみなので距離・dt は保たれる。
	vec3 boxC = (uBoxMin + uBoxMax) * 0.5;
	vec3 roL = (uInvModel * vec4(ro - boxC, 1.0)).xyz + boxC;
	vec3 rdL = (uInvModel * vec4(rd, 0.0)).xyz;

	// 太陽方向もローカル空間へ（雲が回れば影も一緒に回る）
	gSunDirL = normalize((uInvModel * vec4(uSunDir, 0.0)).xyz);

	// --- レイ vs 雲ボックス（以降はすべてローカル空間で進める）---
	vec2 tHit = intersectBox(roL, rdL, uBoxMin, uBoxMax);
	float tEnter = max(tHit.x, 0.0);
	float tExit  = tHit.y;
	if (tExit <= tEnter) { fragColor = vec4(sky, 1.0); return; }   // 箱に当たらない

	// --- 区間を等間隔に刻んで積分 ---
	float dt = (tExit - tEnter) / float(uSteps);
	// バンディング除けのディザ（開始位置を 1 ステップ未満だけずらす）
	float ign = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
	float t = tEnter + dt * ign;

	float transmittance = 1.0;   // T：手前からの累積透過率
	vec3  color = vec3(0.0);     // 積み上げる雲色（乗算済み）

	for (int i = 0; i < 256; i++) {
		if (i >= uSteps || transmittance < 0.01) break;   // 不透明になったら打ち切り

		vec3 p = roL + rdL * t;
		vec3 cell = (p - uBoxMin) / (uBoxMax - uBoxMin);
		float d = texture(uVolume, cell).r;

		if (d > 0.0) {
			float segT = exp(-d * uSigma * dt);   // このセグメントの透過率
			vec3  L = lighting(p, cell, d);        // ★この点の見える色（あなたが育てる）
			// front-to-back 合成：(1-segT) はこの区間で散乱・吸収された割合
			color += transmittance * (1.0 - segT) * L;
			transmittance *= segT;
		}
		t += dt;
	}

	// 残った透過率の分だけ背景の空が透ける（雲を空の上に合成）
	vec3 outc = color + transmittance * sky;
	fragColor = vec4(outc, 1.0);
}
