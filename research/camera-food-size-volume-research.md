# スマートフォン／PCカメラによる食品の寸法・体積・重量推定 技術調査

- 調査日: 2026-07-24
- 対象: Photo Carb Counter 研究プロトタイプ
- 前提: 質問中の「iPS」は「iOS」の意味として調査した
- 変更範囲: 調査文書のみ。アプリ本体には変更を加えていない

## 技術サマリー

現時点で、スマートフォンや通常のPCカメラだけを使い、Webアプリから食品の**重量を直接測る**成熟した汎用技術はない。カメラで取得できるのは画像、輪郭、相対的な奥行き、対応端末では深度であり、重量は原則として次の推定になる。

```text
推定重量[g] = 推定体積[mL] × 見かけ密度[g/mL] × 可食部率
```

したがって「デジタルのぎす」に近い機能は実現可能だが、「デジタル秤」と同等にはならない。食品は内部の空隙、調理状態、水分量、容器、非可食部によって、同じ外形でも重量が変わる。

Photo Carb Counter に最も適する第一候補は、**既知寸法の印刷マーカー付き計測マットと、通常のRGBカメラで撮る2枚の写真または短い周回動画**を使う方式である。WebXRの空間追跡の代わりにマーカーからカメラ姿勢と絶対尺度を求め、食品の輪郭を多視点で交差させて体積を復元する。この方法なら、iOS Safari、Android、Windowsの通常ブラウザを共通の入口にできる。

推奨順位は次のとおり。

1. 印刷マーカー付きマット + 上面／斜めの2画像による寸法・単純形状体積
2. 同じマット + 5〜10秒の周回動画 + Shape from Silhouette（Visual Hull）
3. 対応Androidだけ WebXR Hit Test／Depth を追加利用
4. 高精度が必要な場合だけ、iOS Object Capture／ARKit または Windows深度カメラのネイティブ経路を追加
5. 体積から重量を出す際は、密度だけに頼らず、既存FNDDSのポーション重量を優先して校正する

## 調査上の重要な区別

| 欲しい値 | 通常RGB写真 | マーカー付き写真 | 多視点動画 | 深度センサー | 備考 |
|---|---:|---:|---:|---:|---|
| 平面上の長さ・幅 | 相対値のみ | 可 | 可 | 可 | 既知尺度または深度が必要 |
| 高さ | 不安定 | 斜め画像なら可 | 可 | 可 | 1枚の真上写真だけでは原理的に不足 |
| 表面積 | 困難 | 形状仮定が必要 | メッシュ化できれば可 | 可 | 底面・穴の処理が必要 |
| 外形体積 | 困難 | 単純形状なら可 | 可 | 可 | 閉じた形状の生成が必要 |
| 重量 | 不可 | 体積から推定 | 体積から推定 | 体積から推定 | 密度・可食部率・食品分類が必要 |

## 方式比較

| 方式 | 追加物 | iOS Web | Windows Web | 絶対尺度 | 体積 | 主な弱点 | 本案件での位置づけ |
|---|---|---:|---:|---:|---:|---|---|
| 手を基準にした単眼写真 | なし | 可 | 可 | 個人の実寸登録時のみ | 概算 | 手と食品の奥行き差、姿勢 | フォールバック |
| クレジットカード等の既知物体 | 手持ち物 | 可 | 可 | 可 | 単純形状のみ | 規格差、食品と同一平面が必要 | 簡易PoC |
| AprilTag／ArUcoマーカー | 印刷物 | 可 | 可 | 可 | 2画像以上で可 | 印刷倍率、反射、隠れ | 有力 |
| ChArUco計測マット | 印刷物 | 可 | 可 | 可 | 2画像／動画で可 | マットを携行する必要 | **第一候補** |
| 動画 + Visual Hull | 計測マット | 可 | 可 | 可 | 可 | 凹部を埋め、底面が見えない | **第二段階** |
| 写真測量（SfM/MVS） | 多数画像、計算資源 | 可（撮影） | 可（撮影） | マーカー等が必要 | 可 | 無地・光沢・透明・変形食品に弱い | サーバー／デスクトップ検証向け |
| WebXR Hit Test／Depth | 対応Android | 非対応 | 通常PCは非対応 | 可 | 可 | 対応端末・ブラウザが限定 | オプション |
| iOS Object Capture／ARKit | 対応iPhone/iPad、ネイティブ実装 | 不可 | - | 深度ありなら可 | 可 | Webアプリから直接利用不可 | 将来のネイティブ補助 |
| Windows MediaCapture + 深度カメラ | 外付け／内蔵深度センサー、ネイティブ実装 | - | 不可 | 可 | 可 | 普通のWebカメラには深度がない | 実験室向け |
| 単眼AI深度推定 | なし | 可 | 可 | 原則相対 | 不安定 | 学習分布依存、尺度曖昧性 | 単独計測には非推奨 |

## 推奨案: WebXRに依存しない「マーカー式ARのぎす」

### 計測用ターゲット

A4またはA5の印刷可能な計測マットを用意する。周囲に複数のAprilTagまたはArUcoを置き、中央は食品や皿を置ける空白にする。精密なカメラ校正も兼ねる場合はChArUcoを利用する。

計測マットに持たせたい要素は次のとおり。

- マーカー間距離と各辺の長さをmmで固定
- 印刷倍率確認用の100 mm定規
- 複数IDのマーカーを四隅に配置し、一部が食品や皿で隠れても姿勢を復元可能にする
- MVSの特徴点を増やすため、食品を邪魔しないランダムな細点パターンを背景に入れる
- 色補正用の小さな白・灰・黒パッチを任意で追加
- PDF印刷時は「実際のサイズ／100%」を必須とし、初回に定規で検証する

[AprilTag 3](https://github.com/AprilRobotics/apriltag) は既知のタグ寸法とカメラ内部パラメータから姿勢を推定でき、OpenCVの `SOLVEPNP_IPPE_SQUARE` も利用できる。OpenCVは、単一のArUcoマーカーの4隅だけでも姿勢推定に必要な対応点が得られるとしている。より精密なコーナー検出とカメラ校正には [ChArUco](https://docs.opencv.org/master/df/d4a/tutorial_charuco_detection.html) が適する。

### 撮影プロトコル

最初のWeb実装は自由撮影にせず、失敗を減らすためガイド付きにする。

1. 食品または皿を計測マット中央に置く。
2. 真上に近い画像を撮り、長さ・幅・平面面積を取得する。
3. 30〜50度程度の斜め画像を撮り、高さを取得する。
4. より高い精度が必要な場合は、食品を動かさず、カメラを半周〜一周させて5〜10秒撮影する。
5. 各フレームでマーカー検出品質、ブレ、食品の欠け、露出を評価し、良好なフレームだけを間引いて使う。

回転台方式も3Dスキャンでは一般的だが、食品だけを回して背景マーカーを固定すると、物体座標系とカメラ座標系の対応を別途求める必要がある。Web PoCでは**食品を静止させ、カメラを動かす**方が単純である。

### 復元パイプライン

```text
camera/getUserMedia
  → 良好フレーム抽出
  → マーカー検出
  → カメラ内部パラメータ校正 + 各フレーム姿勢推定
  → 食品／皿のセグメンテーション
  → Visual Hull（ボクセルカービング）またはMVS点群
  → 底面処理・メッシュ修復
  → 尺度付き閉メッシュ／ボクセル体積
  → ポーション重量または見かけ密度で重量推定
  → 信頼区間・失敗理由を併記
```

Visual Hullは、複数視点のシルエットが作る視体積を交差させる方法で、元論文は「同じシルエットを持つ最大の形状」と定義している。その性質上、ボウル状のくぼみ、ドーナツの内側、食品表面の谷など、輪郭に現れない凹部は埋まり、体積を過大評価する。反面、パン、果物、おにぎり、盛り付けた米のように、表面テクスチャが乏しくても輪郭が安定する食品には、特徴点ベースのMVSより壊れにくい可能性がある。これは本案件への適用に関する推論であり、実食品による検証が必要である。

### 寸法を先に、完全3Dを後にする理由

最初から汎用3D復元を目指すと、セグメンテーション、カメラ校正、姿勢、反射、底面、穴埋めの誤差が一度に重なる。まず次の形状モデルで測定値を出し、ユーザーが食品に近いモデルを選ぶ方が、実装も誤差説明も容易である。

- 直方体: パン、ケーキ、豆腐
- 楕円体: 果物、じゃがいも、おにぎり
- 円柱／円錐台: 飲料、プリン、カップ食品
- 押し出し形状: 真上の輪郭面積 × 平均高さ
- 皿上の山: 楕円放物面、または高さマップ積分

Web版の第一段階では、2画像から長さ・幅・高さを得て、これらの単純形状へ当てはめるだけでも、現在の「手サイズカテゴリ + 画像モデル推定」より測定根拠を明確にできる。

## Webアプリで可能な範囲

### 利用できるもの

[Media Capture and Streams](https://www.w3.org/TR/mediacapture-streams/) の `getUserMedia()` により、許可を得てカメラ映像を取得できる。映像フレームは `<video>` からCanvasへ描画する方法を共通フォールバックとし、利用可能な環境では [MediaStreamTrackProcessor](https://www.w3.org/TR/mediacapture-transform/) と [WebCodecs `VideoFrame`](https://www.w3.org/TR/webcodecs/) をWorkerで処理できる。

マーカー検出と幾何計算は、OpenCV.jsまたはC/C++実装をWebAssemblyへ移植する構成が考えられる。ただしAprilTag公式実装はLinuxのみを公式サポートしており、既存のJavaScript／WASM移植版を採用する場合は、保守状況、ライセンス、検出精度を別途監査する必要がある。

### Webだけでは一般に得られないもの

通常の `getUserMedia()` から、ARKit／ARCore相当のメートル単位カメラ姿勢、カメラ内部パラメータ、LiDAR深度が全ブラウザ共通で得られるわけではない。[Image Capture](https://www.w3.org/TR/image-capture/) には焦点距離設定等があるが、メートル単位の深度マップや完全な内部パラメータ取得を保証するAPIではない。この不足を印刷マーカーとChArUco校正で補う。

`MediaStreamTrackProcessor` は2026年時点でもW3C Working Draftであるため、これだけに依存しない。PoCでは実機のSafari／Chrome／Edgeで能力検出し、非対応時は `<video>` + Canvasへ戻す。

## WebXR「ARのぎす」の適用範囲

[WebXR Hit Test](https://www.w3.org/TR/webxr-hit-test-1/) は、実空間へのレイと現実表面の交点姿勢を返すため、2点をユーザーがタップして距離を測る「ARのぎす」を構成できる。[WebXR Depth Sensing](https://www.w3.org/TR/webxr-depth-sensing-1/) は、対応デバイス上で深度値をメートルへ変換する情報を提供する。

一方、Googleの公式要件ではWebXR ARはWebXR対応ブラウザ、ARCore対応Android端末、Google Play Services for AR、HTTPS等のSecure Contextが必要である。Appleスタッフの回答では、iOS／visionOSのSafariでWebXR `immersive-ar` セッションは利用できないとされている。したがって、WebXRを共通基盤にはせず、能力検出できたAndroid端末だけの補助経路とする。

## iOSで可能な方法

### Safari／PWA

通常のカメラ写真・動画と印刷マーカーを使う方式は実現可能である。ただしSafariからARKitのシーン深度、Object Capture、LiDAR点群を直接利用する共通Web APIはない。そのためWeb版はRGB画像のみを前提にする。

### ネイティブiOS

[RealityKit Object Capture](https://developer.apple.com/documentation/realitykit/capturing-photographs-for-realitykit-object-capture/) はiOS 17以降／macOS 12以降で、多方向から撮った重複のある写真を解析して3Dモデルを作る。`ObjectCaptureSession` は一周撮影をガイドし、撮影画像は端末上の `PhotogrammetrySession` で復元できる。`PhotogrammetrySession.Request` はモデル、境界ボックス、点群、推定カメラ姿勢を出力でき、境界ボックスは生成モデルと同じ大きさを返す。ただしiOS上のモデル詳細度は現時点で `.reduced` のみである。

Appleは、入力画像に深度があればObject Captureが実寸計算に利用し、深度がない画像からもモデルは作れるが、ARシーン配置時に尺度調整が必要な場合があるとしている。したがって、Object Captureでも、深度のない通常画像だけなら既知尺度マーカーを併用する方が安全である。

[AVFoundationの深度写真](https://developer.apple.com/documentation/avfoundation/capturing-photos-with-depth) では、背面デュアルカメラは相対精度のdisparity、前面TrueDepthはメートル単位の絶対精度を提供できる。いずれも対応カメラを明示選択して深度出力を有効化する必要がある。食品撮影では前面TrueDepthは取り回しが悪く、背面LiDAR／ARKit Scene Depthのネイティブ利用が現実的である。

ただしiPhone 12 Pro LiDARを地形・箱で評価した研究では、辺長10 cm超の小物で絶対精度約±1 cm、10 cm未満で精度低下、検出限界は約5 cmと報告されている。小さな食品や薄い食品に対し「mm単位のデジタルのぎす」と同じ精度を期待すべきではない。

## Windowsで可能な方法

### 通常のブラウザ + Webカメラ

一般的なノートPC内蔵カメラはRGBだけなので、iOS Safariと同様に、印刷マーカー + 複数画像／動画が基本になる。固定PCカメラの場合は、既知角度で食品を回すターンテーブル、またはL字型のマーカー治具を組み合わせると撮影を標準化できる。

### ネイティブWindows + 深度カメラ

[MediaFrameReader](https://learn.microsoft.com/en-us/windows/apps/develop/camera/process-media-frames-with-mediaframereader) は、色、深度、赤外などのフレームソースを処理できる。[VideoMediaFrame.CameraIntrinsics](https://learn.microsoft.com/en-us/uwp/api/windows.media.capture.frames.videomediaframe.cameraintrinsics?view=winrt-26100) と [CameraIntrinsics](https://learn.microsoft.com/en-us/uwp/api/windows.media.devices.core.cameraintrinsics?view=winrt-26100) は焦点距離、主点、歪み、投影／逆投影を扱う。[DepthCorrelatedCoordinateMapper](https://learn.microsoft.com/en-us/uwp/api/windows.media.devices.core.depthcorrelatedcoordinatemapper?view=winrt-26100) は深度を使って2D点を3D空間へ逆投影できる。

MicrosoftはUVCカメラの深度ストリームもサポートしているが、当然ながら実際に深度形式を出力するハードウェアが必要である。普通のWebカメラをソフトウェアだけで深度カメラにするAPIではない。実験室で外付け深度カメラを許容できる場合は有力だが、「スマホの機能の範囲内」「Webアプリ中心」という要件からは外れる。

## 3Dプリンター／3Dスキャナー技術から転用できるもの

3Dプリンター自体が食品を測るわけではないが、3Dスキャンから印刷可能モデルを作る工程は、体積計測の後半にそのまま応用できる。

### 写真から点群・メッシュへ

[COLMAP](https://colmap.github.io/) はSfMでカメラ姿勢と疎な3D構造を復元し、MVSで深度・法線を求め、密な点群とメッシュを生成する。公式ガイドも、テクスチャ、均一照明、高い画像重複、異なる撮影位置を必要条件として挙げ、動画はフレームを間引くよう勧めている。[Meshroom](https://meshroom.org/index.php/download/) もWindows向けを含む写真測量、カメラ追跡、LiDARメッシュ化のパイプラインを提供する。

これらは検証用の基準パイプラインとして有用だが、ブラウザ内で毎食実行するには重い。まずデスクトップまたはバックエンドで再構築精度を評価し、その結果を見て、軽量なVisual HullをWebAssembly／WebGPUで実装するか判断するのがよい。

### 点群から閉メッシュへ

[Open3D](https://www.open3d.org/docs/latest/tutorial/geometry/surface_reconstruction.html) のPoisson Surface Reconstructionは法線付き点群から滑らかな表面を生成する。ただし、観測点が少ない場所にも面を外挿するため、皿との接触面や底部に架空の体積ができる可能性がある。密度の低い頂点を除去し、底面を食品が載る平面で明示的に閉じる処理が必要になる。

[Blender 3D Print Toolbox](https://docs.blender.org/manual/nb/3.6/addons/mesh/3d_print_toolbox.html) はメッシュの体積・面積計算と、非多様体、穴、法線等の検査・修復を行う。[trimesh](https://trimesh.org/trimesh.html) も、有効な体積にはwatertight、面の向きの一貫性、外向き法線が必要で、閉じていないメッシュの体積計算は無効と明記している。

### 絶対尺度を失わないこと

3D復元モデルが見た目上正しくても、尺度が相対値ならmLは求められない。尺度は次のいずれかから必ず導入する。

- 印刷マーカーの既知寸法
- 深度センサーのメートル値
- 既知のカメラ移動量／ステレオ基線
- 既知寸法の治具または回転台

3Dプリントで一般的なSTLは単位情報を持たないため、計測の中間形式には不向きである。単位と閉じた形状を仕様で扱う [3MF](https://3mf.io/) または、単位メタデータを明示したglTF／PLYと別JSONを使う方が安全である。少なくともアプリ内部ではmm、mm²、mLを固定する。

## 食品研究の既存知見

### 多視点3Dは高精度になり得るが、条件が違う

2026年の [VolE](https://www.nature.com/articles/s41598-026-38756-5) は、AR対応モバイル端末から得た自由移動画像とカメラ位置、動画セグメンテーションを使い、複数データセットで2.22% MAPEを報告した。これは多視点3D復元が有望である根拠になるが、21食品の新規ベンチマークを含む研究条件であり、単一写真、通常のSafari、未知のカメラ姿勢で同じ精度が出ることを意味しない。

### 参照物なし方式にも撮影制約がある

スマートフォン底辺を卓上に接触させ、端末寸法と姿勢センサーから校正する研究では、大きい10食品の平均絶対誤差は16.65%だったが、小さい5食品は47.60%だった。この方式は参照マーカー不要だが、端末を卓上に置いて撮るという強い制約があり、自由撮影の一般解ではない。

### 参照カード + 形状テンプレートは実用的な比較対象

[PortionSizeアプリの14人・3日間の自由生活パイロット](https://pubmed.ncbi.nlm.nih.gov/38888538/) では、参照カードと食品テンプレートを使い、グラム摂取量はデジタル写真法と同等だった一方、エネルギー摂取量は同等でなく、食品群の誤差は11〜23%だった。小規模研究であるが、完全自動3Dより先に「参照カード + ガイド + 食品別テンプレート」を実装する価値を支持する。

## Photo Carb Counterへの接続可能性

現行実装を読み取り、変更せずに接続点を確認した。

- `src/lib/hand.ts` は人差し指MCPと小指MCPの画像上の距離から `palmWidthRatio` を計算済みである。
- `src/lib/gemini.ts` の重量推定プロンプトには手の検出、信頼度、手サイズカテゴリ、境界ボックスを送っているが、`palmWidthRatio` 自体は送っていない。
- Geminiへ送る画像は最大1280 px、品質0.88へ縮小される。将来の幾何計測は、この縮小画像ではなく原画像ピクセルまたは動画フレームを使うべきである。
- `src/App.tsx` の現行フローはファイル選択であり、ライブカメラのガイド撮影はまだない。
- 統合食品データは7,970件で、そのうち5,432件にポーション重量がある。簡易文字列判定では4,280件に `cup`、`tbsp`、`tsp`、`ml` 等の容積系ポーション表現がある。これらは「体積→重量」を未知密度だけで変換する代わりに利用できる。

現行の手参照を廃止する必要はない。ユーザーが初回に手掌幅をmmで登録できれば、マーカーがない写真のフォールバックになる。ただし、手と食品が同一平面に近いこと、手の傾きが小さいことを品質条件にする必要がある。

## 推奨データモデル

将来の実装では、Geminiの重量推定結果とは別に、測定の由来と不確かさを保存する。

```ts
type GeometryMeasurement = {
  method:
    | "marker-two-view"
    | "marker-video-visual-hull"
    | "webxr-hit-test"
    | "native-depth"
    | "hand-reference";
  lengthMm?: number;
  widthMm?: number;
  heightMm?: number;
  projectedAreaMm2?: number;
  volumeMl?: number;
  calibration: {
    kind: "charuco" | "apriltag" | "depth" | "hand";
    reprojectionErrorPx?: number;
    visibleMarkerCount?: number;
  };
  uncertainty: {
    relativePercent?: number;
    lowerVolumeMl?: number;
    upperVolumeMl?: number;
    reasons: string[];
  };
};
```

重量変換は別レイヤーにし、次の優先順位を推奨する。

1. 選択食品と一致するFNDDSポーションの `gramWeight`
2. 個数・スライス・カップ等の既存ポーションと幾何寸法の比率
3. 同一食品の実測見かけ密度
4. 食品カテゴリの密度範囲
5. Gemini推定は形状選択、食品分割、例外検出の補助に使い、単独の計測器とはしない

## 実装前の検証計画

### Phase 0: オフライン技術検証

アプリへ組み込む前に、別スクリプト／実験ページで次を比較する。

- AprilTagとChArUcoの検出率、姿勢の再投影誤差
- 1画像、2画像、動画Visual Hull、COLMAP/MVSの差
- 原画像と1280 px縮小画像の寸法誤差
- iPhone Safari、Android Chrome、Windows Edgeの撮影解像度と処理時間
- 既知寸法の直方体、円柱、楕円体で寸法・体積誤差を測る

合格基準の暫定案は、剛体テスト物で長さ誤差5%以下、体積誤差10%以下、実食品で体積誤差20%以内を主要食品群の80%以上で達成すること。これは製品精度を保証する値ではなく、研究PoCのGo/No-Go基準として事前登録する案である。

### Phase 1: 2画像のWeb計測

- 印刷マットを配布
- 真上・斜めの撮影ガイド
- マーカー検出と品質ゲート
- ユーザー補正可能な食品輪郭
- 単純形状による体積と範囲表示
- マーカーがない場合は現在の手参照へ戻す

### Phase 2: 動画Visual Hull

- 5〜10秒動画から10〜30フレームを選択
- 各フレームのマーカー姿勢と食品マスクを推定
- 2〜5 mm程度のボクセルから開始し、端末性能に応じて解像度を変える
- 皿の平面で底部を閉じ、ボクセル占有数からmLを求める
- 視点不足、マーカー不足、輪郭不一致を不確かさへ反映

ブラウザ内処理が重すぎる場合は、画像を外部へ送る前提を自動で採用しない。現在のアプリはAPIキーをメモリだけで扱う方針であり、食品画像の保存・送信範囲について別のプライバシー設計とユーザー同意が必要になる。

### Phase 3: 高機能端末の拡張

- 対応Android: WebXR Hit Test／Depth
- iOSネイティブ版が必要になった場合: Object CaptureまたはARKit Scene Depth
- Windows研究環境: 深度UVCカメラ + MediaFrameReader

同じ `GeometryMeasurement` へ正規化すれば、端末別実装を重量・炭水化物計算から分離できる。

## リスクと対策

| リスク | 影響 | 対策 |
|---|---|---|
| 印刷倍率が100%でない | 全寸法・体積が系統的にずれる | 100 mm確認線、初回校正、マーカー間距離の自己検査 |
| マーカーと食品の平面が違う | 高さ・尺度に偏り | 同一マット、複数マーカー、姿勢の再投影誤差を表示 |
| 白米、パン、ソース等が背景と同色 | 輪郭誤差 | 色の違うマット、ユーザー補正、複数フレーム整合性 |
| 光沢・透明・湯気 | MVS／深度欠損 | Visual Hull併用、容器形状から推定、低信頼扱い |
| 皿や容器を食品に含める | 体積過大 | 皿平面・縁を別セグメント、容器既知形状を使う |
| 凹形状・重なり | Visual Hullが過大 | 食品別形状モデル、上限推定として表示、多視点追加 |
| 食品が撮影中に動く・溶ける | 3D不整合 | 短時間撮影、フレーム整合性検査、2画像方式へ戻す |
| 体積が正しくても密度が違う | 重量・炭水化物誤差 | 食品別ポーション重量を優先、範囲表示、実測データ収集 |
| 高精度に見えるUI | 過信 | 有効桁を抑える、方法・誤差・参考推定であることを明示 |

## 最終提案

アプリへ変更を加える前の次の一手は、**ChArUco／AprilTag付き計測マット、既知体積のテスト物、iPhoneとWindowsカメラを用いた小規模ベンチマーク**である。まず2画像方式をCOLMAP／Visual Hullの結果と比較し、体積精度の上積みが撮影負担に見合うか判断する。

本案件では、WebXR「ARのぎす」を全端末へ移植しようとするより、次の共通核を作る方が現実的である。

```text
共通Web: 印刷尺度 + ガイド撮影 + 幾何計測
    ├─ 通常端末: 2画像／動画Visual Hull
    ├─ Android対応端末: WebXRで姿勢・深度を補強
    ├─ iOSネイティブ: Object Capture／ARKitを補強
    └─ Windows研究環境: 深度カメラを補強
```

この構成なら、対応端末だけに高度な深度機能を追加しつつ、iOS Safariと通常のWindowsカメラを切り捨てずに済む。重量については、幾何計測値を既存FNDDSポーション重量と結び付け、不確かさを明示するのが妥当である。

## 主要参考資料

### Web・マーカー・幾何

- [W3C: Media Capture and Streams](https://www.w3.org/TR/mediacapture-streams/)
- [W3C: MediaStreamTrack Insertable Media Processing using Streams](https://www.w3.org/TR/mediacapture-transform/)
- [W3C: WebCodecs](https://www.w3.org/TR/webcodecs/)
- [W3C: MediaStream Image Capture](https://www.w3.org/TR/image-capture/)
- [W3C: WebXR Hit Test Module](https://www.w3.org/TR/webxr-hit-test-1/)
- [W3C: WebXR Depth Sensing Module](https://www.w3.org/TR/webxr-depth-sensing-1/)
- [Google: WebXR requirements](https://developers.google.com/ar/develop/webxr/requirements)
- [Apple Developer Forums: WebXR `immersive-ar` support](https://developer.apple.com/forums/thread/756850)
- [AprilRobotics: AprilTag 3](https://github.com/AprilRobotics/apriltag)
- [OpenCV: Detection of ChArUco Boards](https://docs.opencv.org/master/df/d4a/tutorial_charuco_detection.html)
- [OpenCV: Detection of ArUco Markers](https://docs.opencv.org/trunk/d5/dae/tutorial_aruco_detection.html)
- Laurentini A. [The Visual Hull Concept for Silhouette-Based Image Understanding](https://doi.org/10.1109/34.273735), IEEE TPAMI, 1994.

### iOS・Windows

- [Apple: Capturing photographs for RealityKit Object Capture](https://developer.apple.com/documentation/realitykit/capturing-photographs-for-realitykit-object-capture/)
- [Apple: ObjectCaptureSession](https://developer.apple.com/documentation/realitykit/objectcapturesession)
- [Apple: PhotogrammetrySession.Request.bounds](https://developer.apple.com/documentation/realitykit/photogrammetrysession/request/bounds)
- [Apple: PhotogrammetrySession.Request.Detail](https://developer.apple.com/documentation/realitykit/photogrammetrysession/request/detail)
- [Apple: Capturing photos with depth](https://developer.apple.com/documentation/avfoundation/capturing-photos-with-depth)
- [Microsoft: Process media frames with MediaFrameReader](https://learn.microsoft.com/en-us/windows/apps/develop/camera/process-media-frames-with-mediaframereader)
- [Microsoft: CameraIntrinsics](https://learn.microsoft.com/en-us/uwp/api/windows.media.devices.core.cameraintrinsics?view=winrt-26100)
- [Microsoft: DepthCorrelatedCoordinateMapper](https://learn.microsoft.com/en-us/uwp/api/windows.media.devices.core.depthcorrelatedcoordinatemapper?view=winrt-26100)
- [Microsoft: UVC Camera Implementation Guide](https://learn.microsoft.com/en-us/windows-hardware/drivers/stream/uvc-camera-implementation-guide)

### 3Dスキャン・メッシュ・食品評価

- [COLMAP: Structure-from-Motion and Multi-View Stereo](https://colmap.github.io/)
- [COLMAP Tutorial](https://colmap.github.io/tutorial.html)
- [Meshroom / AliceVision](https://meshroom.org/index.php/download/)
- [Open3D: Surface reconstruction](https://www.open3d.org/docs/latest/tutorial/geometry/surface_reconstruction.html)
- [Blender: 3D Print Toolbox](https://docs.blender.org/manual/nb/3.6/addons/mesh/3d_print_toolbox.html)
- [trimesh documentation](https://trimesh.org/trimesh.html)
- [3MF Consortium](https://3mf.io/)
- Haroon U, et al. [VolE: A point-cloud framework for food 3D reconstruction and volume estimation](https://www.nature.com/articles/s41598-026-38756-5), Scientific Reports, 2026.
- [Image-based food portion size estimation using a smartphone without a fiducial marker](https://www.cambridge.org/core/journals/public-health-nutrition/article/imagebased-food-portion-size-estimation-using-a-smartphone-without-a-fiducial-marker/47ED461DDE607FE0C7E6D70168E80BFA), Public Health Nutrition.
- Diktas HE, et al. [Evaluating the Validity of the PortionSize Smartphone Application](https://pubmed.ncbi.nlm.nih.gov/38888538/), J Nutr Educ Behav, 2024.
- Luetzenburg G, et al. [Evaluation of the Apple iPhone 12 Pro LiDAR for an Application in Geosciences](https://www.nature.com/articles/s41598-021-01763-9), Scientific Reports, 2021.

## 注意

本調査は研究プロトタイプの設計検討であり、医療機器としての性能、栄養摂取量、インスリン投与量、治療判断を保証するものではない。実装時は推定値、測定方法、信頼区間、失敗条件を利用者へ明示し、実測秤による妥当性検証を継続する必要がある。
