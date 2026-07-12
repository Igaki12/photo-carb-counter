# Photo Carb Counter 開発メモ

## プロジェクト概要
- React + Vite の単一ページ研究プロトタイプ。食品写真と手の参照から、炭水化物量の参考推定を行う。
- GitHub Pages では `docs/` を公開ディレクトリとして使う。`docs/` 内の生成物を直接編集せず、必ずソースを変更して `npm run build` で反映する。
- 本アプリは研究目的の参考ツールであり、医療機器ではない。インスリン投与量の推奨や治療判断機能は追加しない。
- Gemini API キーはユーザーが毎回入力する。React のメモリ上だけで扱い、`localStorage`、`sessionStorage`、IndexedDB、Cookie、URL には保存しない。

## 主要コマンド
- 依存関係のインストール: `npm install`
- 開発サーバー起動: `npm run dev -- --port 5173`
- FNDDS 食品データ変換: `npm run data:foods`
- 食品名 embedding 生成: `npm run data:embeddings`
- テスト: `npm run test`
- GitHub Pages 用ビルド: `npm run build`

## データパイプライン
- 現在の主データ: `FoodDataCentral_FNDDS.json`
- FNDDS 変換スクリプト: `scripts/convert_fndds_food_data.py`
- 旧データ: `日本食品標準成分表-炭水化物編_2023.xlsx`
- 旧 Excel 変換スクリプト: `scripts/convert_food_table.py`
- 変換後の食品データ:
  - `src/data/foods.json`: テストや型確認用
  - `public/data/foods.json`: アプリ実行時に fetch するデータ
  - `docs/data/foods.json`: `npm run build` 後の公開用データ
- FNDDS 変換後は 5432 件の食品を持ち、そのうち 5431 件に炭水化物値がある。
- 炭水化物量は FNDDS の `Carbohydrate, by difference` を 100g あたりの値として使う。
- `Total Sugars`、`Fiber`、`Energy`、`Protein`、`Fat`、WWEIA カテゴリ、ポーション重量も保持する。

## Embedding データ
- 生成スクリプト: `scripts/generate-food-embeddings.mjs`
- 出力:
  - `public/data/food-embeddings.json`
  - `docs/data/food-embeddings.json`（`npm run build` 後）
- embedding は食品名のみから生成する。モデルは `gemini-embedding-2`、既定の次元数は 768。
- FNDDS 版では embedding 件数は 5432 件になる。
- `npm run data:foods` を実行すると、食品 ID が変わる可能性があるため `public/data/food-embeddings.json` は空にリセットされる。その後 `npm run data:embeddings` で再生成する。
- embedding JSON は 100MB を超えないよう minified JSON として保存する。pretty print に戻さない。
- 現在の 5432 件 / 768 次元の minified embedding は約 84.9MB。
- 生成スクリプトは途中保存と再開に対応している。429 / 5xx で失敗した場合は、同じ `npm run data:embeddings` を再実行すれば既存 foodId をスキップして続きから進む。
- 生成例:
  ```bash
  export GEMINI_API_KEY='AIza...'
  npm run data:embeddings
  npm run build
  ```

## アプリの挙動
- 基本フローは、API キー入力、写真アップロード、MediaPipe 手検出、手サイズ選択、食品候補ランキングまたは手動検索、追加質問、Gemini Structured Output による可食部重量推定、炭水化物量結果表示。
- MediaPipe Hands は `@mediapipe/tasks-vision` でブラウザ内実行する。
- 手ランドマークのオーバーレイは、画像ステージ全体ではなく、`object-fit: contain` 後の実際の画像表示領域に合わせる。画像レイアウトを変える場合は `src/lib/imageGeometry.ts` と `src/components/HandOverlay.tsx` の前提を壊さない。
- 食品候補ランキングは、正規化済みベクトル同士の内積で行う。
- embedding が未生成または API 呼び出しに失敗した場合でも、手動検索は使える状態を維持する。
- 追加質問は `src/lib/questions.ts` のルールベース。FNDDS は英語食品名・英語カテゴリなので、日本語だけでなく英語の `coffee`、`sandwich`、`pizza`、`burger` なども判定対象にする。
- 最終的な炭水化物計算は `src/lib/carb.ts` で行う。部品ごとのグラム数 × FNDDS の 100g あたり炭水化物量に、質問回答による補正を加える。

## Gemini API 方針
- ブラウザ実行時は `https://generativelanguage.googleapis.com/v1beta` を使う。
- `src/lib/gemini.ts` が担当する処理:
  - API 接続テスト
  - アップロード画像の embedding
  - `gemini-3.5-flash` による Structured JSON の可食部重量推定
- Structured Output のスキーマを変更する場合も、可食部重量と部品重量は整数グラムで出す方針を維持する。
- API キーをログ出力・永続化しない。

## UI 方針
- 臨床・研究ツール寄りの UI。白背景、コンパクトなパネル、teal / indigo のアクセント、控えめな警告表示を維持する。
- `public/assets/app-icon.png` はアプリアイコンと favicon の元ファイル。差し替え元はリポジトリ直下の `icon.png`。
- 上部バーの `Gemini API キー` ラベルは、横長画面では入力欄行の上端に揃える。
- カードの入れ子や装飾的なカードを増やさない。ランディングページ風の hero section は作らない。

## 検証チェックリスト
- ロジック変更後は `npm run test` を実行する。
- UI、データ、公開物を変更した後は `npm run build` を実行する。
- build 後に `docs/.nojekyll` が存在することを確認する。
- FNDDS 食品データの確認:
  - `foods.length === 5432`
  - 炭水化物値あり食品が 5431 件
  - `Coffee, Latte` や `Cheese sandwich, NFS` が含まれる
- embedding データの確認:
  - `embeddings.length === 5432`
  - unique `foodId` count が 5432
  - vector length が 768
  - 欠損・余分な foodId がない
  - `public/data/food-embeddings.json` と `docs/data/food-embeddings.json` が 100MB 未満
- フロントエンド QA:
  - `http://127.0.0.1:5173/photo-carb-counter/` でアプリが表示される
  - Vite overlay やアプリ由来の console error がない
  - 手動検索が動く
  - embedding 生成済みなら「食品名の事前 embedding は未生成です」表示が出ない
  - 写真アップロード後、手ランドマークが letterbox 余白ではなく画像本体に合う
  - モバイル幅で横スクロールが出ない

## 重要ファイル
- `src/App.tsx`: メインワークフローと状態管理
- `src/components/HandOverlay.tsx`: 手ランドマーク SVG オーバーレイ
- `src/components/QuestionForm.tsx`: 追加質問 UI
- `src/lib/gemini.ts`: Gemini API 呼び出し
- `src/lib/hand.ts`: MediaPipe Hands の初期化と検出
- `src/lib/imageGeometry.ts`: `object-fit: contain` 時の画像表示領域計算
- `src/lib/questions.ts`: 食品ごとの追加質問ルール
- `src/lib/ranking.ts`: embedding ranking と手動検索 ranking
- `src/lib/carb.ts`: 炭水化物量計算
- `scripts/convert_fndds_food_data.py`: FNDDS JSON からアプリ用 JSON への変換
- `scripts/convert_food_table.py`: 旧日本食品標準成分表 Excel から JSON への変換
- `scripts/generate-food-embeddings.mjs`: 再開可能な embedding 生成
