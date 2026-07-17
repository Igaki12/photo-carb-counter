# Photo Carb Counter 開発メモ

## プロジェクト概要
- React + Vite の単一ページ研究プロトタイプ。食品写真と手の参照から、炭水化物量の参考推定を行う。
- GitHub Pages では `docs/` を公開ディレクトリとして使う。`docs/` 内の生成物を直接編集せず、必ずソースを変更して `npm run build` で反映する。
- 本アプリは研究目的の参考ツールであり、医療機器ではない。インスリン投与量の推奨や治療判断機能は追加しない。
- Gemini API キーはユーザーが毎回入力する。React のメモリ上だけで扱い、`localStorage`、`sessionStorage`、IndexedDB、Cookie、URL には保存しない。

## 主要コマンド
- 依存関係のインストール: `npm install`
- 開発サーバー起動: `npm run dev -- --port 5173`
- FNDDS + 文科省食品データ変換: `npm run data:foods`
- 文科省食品名 embedding 生成・再開: `npm run data:embeddings`
- テスト: `npm run test`
- GitHub Pages 用ビルド: `npm run build`

## データパイプライン
- 現在の入力データ:
  - `FoodDataCentral_FNDDS.json`: FNDDS 5432 件
  - `文部科学省-日本食品標準成分表2023.xlsx`: 日本食品標準成分表（八訂）増補2023年 2538 件
- 統合変換スクリプト: `scripts/convert_fndds_food_data.py`
- 旧データ: `日本食品標準成分表-炭水化物編_2023.xlsx`
- 旧 Excel 変換スクリプト: `scripts/convert_food_table.py`
- 変換後の食品データ:
  - `src/data/foods.json`: テストや型確認用
  - `public/data/foods.json`: アプリ実行時に fetch するデータ
  - `docs/data/foods.json`: `npm run build` 後の公開用データ
- 変換後は合計 7970 件（FNDDS 5432 件 + 文科省 2538 件）を持ち、そのうち 7969 件に炭水化物値がある。
- 炭水化物量は可食部 100g 当たりとし、FNDDS は `Carbohydrate, by difference`、文科省は `炭水化物（CHOCDF-）` を使う。
- FNDDS は `Total Sugars`、`Fiber`、`Energy`、`Protein`、`Fat`、WWEIA カテゴリ、ポーション重量も保持する。文科省レコードはカーボカウントに必要な最小フィールドだけを保持する。
- 文科省レコードは `mext-<5桁食品番号>` の ID を使い、括弧付き数値は推定値、`Tr` は 0g の微量値としてフラグを保持する。
- `npm run data:foods` は既存の embedding ファイルを変更・初期化しない。

## Embedding データ
- 生成スクリプト: `scripts/generate-food-embeddings.mjs`
- 出力:
  - `public/data/food-embeddings.json`: 既存 FNDDS 5432 件
  - `public/data/mext-food-embeddings.json`: 文科省 2538 件
  - `docs/data/food-embeddings.json`、`docs/data/mext-food-embeddings.json`: `npm run build` 後の公開用データ
- embedding は食品名のみから生成する。モデルは `gemini-embedding-2`、既定の次元数は 768。
- アプリは FNDDS と文科省の2ファイルを読み込み、食品 ID で統合してランキングに使う。
- `npm run data:embeddings` は文科省 2538 件だけを対象にし、既存 FNDDS embedding を変更しない。
- embedding JSON は 100MB を超えないよう minified JSON として保存する。pretty print に戻さない。
- 現在の FNDDS 5432 件 / 768 次元は 89,011,057 bytes（約84.9 MiB）、文科省 2538 件 / 768 次元は 41,513,744 bytes（約39.6 MiB）。
- 生成スクリプトは10件ごとに原子的に途中保存する。429 / 5xx、その他のエラー、または中断後も、同じコマンドを再実行すれば保存済み `foodId` をスキップして再開する。急な中断では直近最大9件を再生成する場合がある。
- API キーをコマンド履歴やファイルに残さない生成例（キーはサブシェル終了時に破棄される）:
  ```bash
  (
    read -s "GEMINI_API_KEY?Gemini API key: "
    echo
    export GEMINI_API_KEY
    npm run data:embeddings
  )
  npm run build
  ```

## アプリの挙動
- 基本フローは、API キー入力、写真アップロード、MediaPipe 手検出、手サイズ選択、食品候補ランキングまたは手動検索、追加質問、Gemini Structured Output による可食部重量推定、炭水化物量結果表示。
- MediaPipe Hands は `@mediapipe/tasks-vision` でブラウザ内実行する。
- 手ランドマークのオーバーレイは、画像ステージ全体ではなく、`object-fit: contain` 後の実際の画像表示領域に合わせる。画像レイアウトを変える場合は `src/lib/imageGeometry.ts` と `src/components/HandOverlay.tsx` の前提を壊さない。
- 食品候補ランキングは、正規化済みベクトル同士の内積で行う。
- embedding が未生成または API 呼び出しに失敗した場合でも、手動検索は使える状態を維持する。
- 追加質問は `src/lib/questions.ts` のルールベース。FNDDS は英語食品名・英語カテゴリなので、日本語だけでなく英語の `coffee`、`sandwich`、`pizza`、`burger` なども判定対象にする。
- 最終的な炭水化物計算は `src/lib/carb.ts` で行う。部品ごとのグラム数 × 選択食品の可食部 100g あたり炭水化物量に、質問回答による補正を加える。

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
- 統合食品データの確認:
  - `foods.length === 7970`
  - FNDDS が 5432 件、文科省が 2538 件、全 ID が一意
  - 炭水化物値あり食品が 7969 件
  - `Coffee, Latte` や `Cheese sandwich, NFS` が含まれる
  - `mext-01088`、`mext-18007`、`mext-18018`、`mext-04084` の値とフラグが正しい
- embedding データの確認:
  - FNDDS は 5432 件、文科省は 2538 件で、それぞれ unique `foodId` count が件数と一致する
  - 全 vector length が 768 で、非有限値がない
  - 各出典の食品 ID に対して欠損・余分な `foodId` がない
  - `public` と `docs` の対応ファイルが同一で、各 embedding JSON が 100MB 未満
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
- `src/lib/embeddings.ts`: FNDDS と文科省 embedding の検証・統合
- `src/lib/ranking.ts`: embedding ranking と手動検索 ranking
- `src/lib/carb.ts`: 炭水化物量計算
- `scripts/convert_fndds_food_data.py`: FNDDS JSON と文科省 Excel から統合アプリ用 JSON への変換
- `scripts/convert_food_table.py`: 旧日本食品標準成分表 Excel から JSON への変換
- `scripts/generate-food-embeddings.mjs`: 再開可能な embedding 生成
