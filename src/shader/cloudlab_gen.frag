#version 300 es

// ============================================================================
//  雲の密度場ベイク — フラグメントステージ（★あなたの数学はここ★）
// ============================================================================
// このシェーダは 3Dテクスチャの「Zスライス1枚」を描くたびに、各ボクセルで
// ちょうど1回走ります。あなたの仕事はただ一つ —— セル座標 cell ∈ [0,1]^3 を
// 受け取り、その点の雲の密度 density ∈ [0,1] を返す関数 density() を書くこと。
//
//   cell = vec3( gl_FragCoord.xy / uVolumeSize , uWNorm )
//                └ スライス内の XY (0..1) ┘   └ 何枚目か (0..1) ┘
//
// ここで書いた密度は 3Dテクスチャに焼かれ、ビューア(cloudlab_view.frag)が
// レイマーチして Beer 則 T = exp(-Σσ·Δs) で積分し表示します。
// あなたはこの密度関数だけ触れば OK。配線・ベイク・レイマーチは全部用意済み。
// ============================================================================

precision highp float;

out vec4 fragColor;

uniform vec2  uVolumeSize;  // スライス解像度 (W,H)。cell.xy の正規化に使う
uniform float uWNorm;       // このスライスの W 座標 (z+0.5)/depth … cell.z
uniform float uCoverage;    // 調整つまみ（パネルのスライダ）0..1
uniform float uScale;       // 調整つまみ（全体の細かさ・周波数）
uniform float uTime;        // 調整つまみ（時間・実験用）

// ============================================================================
//  ★ あなたの数学：ここから下を書き換えて実験してください ★
//
//  いまは「中心のやわらかい球」という最も簡単な密度です。まずこれが画面に
//  出ることを確認し、そこから一歩ずつ発展させてみてください。例えば:
//
//    1) 球を歪ませる            p.y を伸ばす / sin で波打たせる
//    2) 値ノイズを足す          hash → 格子補間でノイズを作る
//    3) FBM にする              ノイズを周波数2倍・振幅1/2で重ねる
//    4) coverage でしきい値      d = clamp(fbm - (1.0 - uCoverage), 0.0, 1.0)
//    5) 高さ profile g(h) を掛ける  下は丸く上はちぎれる形に
//
//  これらを積み上げると、解説の density(p) に到達します。
//  uCoverage / uScale / uTime はパネルのスライダから渡ってくるので、
//  実験のパラメータとして自由に使ってください（使わなくても OK）。
// ============================================================================

float hash13(vec3 p) {
      p = fract(p * 0.1031);
      p += dot(p, p.zyx + 31.32);
      return fract((p.x + p.y) * p.z);
}

float vnoise(vec3 x) {
      vec3 i = floor(x);
      vec3 f = fract(x);
      f = f * f * (3.0 - 2.0 * f);          // smoothstep 補間重み
      return mix(
              mix(mix(hash13(i + vec3(0,0,0)), hash13(i + vec3(1,0,0)), f.x),
                  mix(hash13(i + vec3(0,1,0)), hash13(i + vec3(1,1,0)), f.x), f.y),
              mix(mix(hash13(i + vec3(0,0,1)), hash13(i + vec3(1,0,1)), f.x),
                  mix(hash13(i + vec3(0,1,1)), hash13(i + vec3(1,1,1)), f.x), f.y),
              f.z);
}

float fbm(vec3 p) {
      float sum = 0.0, amp = 0.5;
      for (int i = 0; i < 5; i++) {
              sum += amp * vnoise(p);
              p *= 2.0;
              amp *= 0.5;
      }
      return sum;                            // だいたい [0,1)
}

float density(vec3 cell) {
	// cell は [0,1]^3。中心を原点に置いて、球の内側を密度 1 にする最も簡単な例。
	vec3 p = cell * (4.0 * uScale) + uTime;     // [-0.5, 0.5]
	// float r = length(p);
	
	// float d = 0.0;
	// d = smoothstep(0.35, 0.20, r);  // r<0.20 で 1、r>0.35 で 0 のやわらかい球
	// d = hash13(floor(cell*8.0));
	// d = vnoise(cell * 5.0);
	// d = fbm(cell * 4.0);
	float n = fbm(p);
	float d = clamp(n - (1.0 - uCoverage), 0.0, 1.0);
	d *= smoothstep(0.5, 0.25, length(cell - 0.5));
	return d;
}

// ----------------------------------------------------------------------------
//  ここから下は触らなくて OK（セル座標を作って density() を呼び、書き込むだけ）
// ----------------------------------------------------------------------------
void main(void) {
	vec3 cell = vec3(gl_FragCoord.xy / uVolumeSize, uWNorm);
	float d = clamp(density(cell), 0.0, 1.0);
	fragColor = vec4(d, 0.0, 0.0, 1.0);   // .r に密度を格納（RGBA8）
}
