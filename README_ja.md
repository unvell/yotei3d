

# Yotei3D

**Yotei3D** は、3D プログラミングの知識が少ないユーザーでも手軽に使える、軽量な WebGL ベースの 3D 描画エンジンです。

---

## ✅ 特徴

- **初心者でも使いやすい設計**  
  数行のコードで 3D シーンを構築可能。3D の知識が少ない方にも最適です。

- **ユーザー視点でのシンプルな構成**  
  `Renderer`、`Scene`、`Cube` や `Sphere` などの簡易オブジェクトに加え、視点操作に便利な Viewer Controller を内蔵。

- **軽量・省メモリ動作**  
  メモリ使用量を抑えた設計と、描画負荷を最小限にする工夫により、Webベースや低スペック環境でも快適に動作。

- **高度な機能もサポート**  
  リアルなシャドウマッピング、柔軟なパーティクルシステム、ポストエフェクトなど、より本格的な表現も可能です。

---

## 📥 インストール

```bash
npm install @unvell/yotei3d
```

---

## 🚀 はじめての使用例

```js
import { Renderer, Scene, Shapes } from '@unvell/yotei3d';

const renderer = new Renderer();
const scene = renderer.createScene();

const cube = new Shapes.Cube();
scene.add(cube);
scene.show();
```

Yotei3D は、カメラ制御・描画・操作系などを内部で自動処理してくれるため、すぐに使い始められます。

---

## 🌟 高度な機能

- 柔らかいエッジ付きのシャドウ描画  
- SSAO（スクリーンスペースアンビエントオクルージョン）  
- ポストエフェクト（ブルーム、ブラーなど）  
- 2D オーバーレイ描画  
- 動的テクスチャ読み込み など

---

## 🗺️ デモ一覧

`/examples/` フォルダや `helloworld.html` を開くと、簡単な 3D シーンを体験できます。