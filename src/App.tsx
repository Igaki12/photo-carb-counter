import type { HandLandmarkerResult } from "@mediapipe/tasks-vision";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  Eye,
  FileJson,
  ImagePlus,
  KeyRound,
  Loader2,
  RefreshCcw,
  Search,
  Sparkles,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { HandOverlay } from "./components/HandOverlay";
import { QuestionForm } from "./components/QuestionForm";
import { calculateCarbEstimate, fallbackWeightEstimate } from "./lib/carb";
import { answersToAdjustments, getQuestionsForFood } from "./lib/questions";
import { manualRank, rankFoodsByEmbedding, rankFoodsByText } from "./lib/ranking";
import {
  embedImage,
  estimateWeightWithGemini,
  fileToImagePayload,
  testGeminiConnection,
  type ImagePayload,
} from "./lib/gemini";
import type {
  CarbEstimate,
  FoodEmbeddingFile,
  FoodItem,
  HandMetrics,
  HandSize,
  RankedFood,
  WeightEstimate,
} from "./types/domain";

const STEP_LABELS = ["写真", "手検出", "食品選択", "質問", "結果"];

function initialHandMetrics(): HandMetrics {
  return { detected: false, confidence: 0, landmarkCount: 0 };
}

function downloadJson(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function formatNumber(value: number): string {
  return value.toLocaleString("ja-JP", { maximumFractionDigits: 1 });
}

export function App() {
  const imageRef = useRef<HTMLImageElement | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [connectionStatus, setConnectionStatus] = useState<"idle" | "testing" | "ok" | "error">("idle");
  const [connectionError, setConnectionError] = useState("");
  const [foods, setFoods] = useState<FoodItem[]>([]);
  const [foodLoadError, setFoodLoadError] = useState("");
  const [embeddingsFile, setEmbeddingsFile] = useState<FoodEmbeddingFile | null>(null);
  const [embeddingLoadError, setEmbeddingLoadError] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [imagePayload, setImagePayload] = useState<ImagePayload | null>(null);
  const [handResult, setHandResult] = useState<HandLandmarkerResult | null>(null);
  const [handMetrics, setHandMetrics] = useState<HandMetrics>(initialHandMetrics);
  const [handStatus, setHandStatus] = useState<"idle" | "detecting" | "detected" | "not-found" | "error">("idle");
  const [handError, setHandError] = useState("");
  const [handSize, setHandSize] = useState<HandSize>("standard");
  const [rankingStatus, setRankingStatus] = useState<"idle" | "embedding" | "ready" | "error">("idle");
  const [rankingError, setRankingError] = useState("");
  const [rankedFoods, setRankedFoods] = useState<RankedFood[]>([]);
  const [manualQuery, setManualQuery] = useState("");
  const [selectedFood, setSelectedFood] = useState<FoodItem | null>(null);
  const [questionValues, setQuestionValues] = useState<Record<string, unknown>>({});
  const [weightStatus, setWeightStatus] = useState<"idle" | "estimating" | "ready" | "error">("idle");
  const [weightError, setWeightError] = useState("");
  const [weightEstimate, setWeightEstimate] = useState<WeightEstimate | null>(null);

  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}data/foods.json`)
      .then((response) => {
        if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
        return response.json();
      })
      .then((data: FoodItem[]) => setFoods(data))
      .catch((error: Error) => setFoodLoadError(error.message));

    fetch(`${import.meta.env.BASE_URL}data/food-embeddings.json`)
      .then((response) => {
        if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
        return response.json();
      })
      .then((data: FoodEmbeddingFile) => setEmbeddingsFile(data))
      .catch((error: Error) => setEmbeddingLoadError(error.message));
  }, []);

  useEffect(() => {
    return () => {
      if (imageUrl) URL.revokeObjectURL(imageUrl);
    };
  }, [imageUrl]);

  const embeddingsReady = Boolean(embeddingsFile?.generatedAt && embeddingsFile.embeddings.length > 0);
  const questions = useMemo(() => (selectedFood ? getQuestionsForFood(selectedFood) : []), [selectedFood]);
  const answers = useMemo(() => answersToAdjustments(questions, questionValues), [questions, questionValues]);
  const carbEstimate: CarbEstimate | null = useMemo(() => {
    if (!selectedFood || !weightEstimate) return null;
    return calculateCarbEstimate(selectedFood, foods, weightEstimate, answers);
  }, [answers, selectedFood, weightEstimate]);

  useEffect(() => {
    if (!selectedFood) return;
    const nextValues: Record<string, unknown> = {};
    for (const question of getQuestionsForFood(selectedFood)) {
      nextValues[question.id] = question.defaultValue ?? (question.kind === "multi" ? [] : "");
    }
    setQuestionValues(nextValues);
    setWeightEstimate(null);
    setWeightStatus("idle");
    setWeightError("");
  }, [selectedFood]);

  async function handleConnectionTest() {
    setConnectionStatus("testing");
    setConnectionError("");
    try {
      await testGeminiConnection(apiKey.trim());
      setConnectionStatus("ok");
    } catch (error) {
      setConnectionStatus("error");
      setConnectionError(error instanceof Error ? error.message : "接続テストに失敗しました。");
    }
  }

  async function handleFileChange(file: File | null) {
    if (!file) return;
    if (imageUrl) URL.revokeObjectURL(imageUrl);
    setImageUrl(URL.createObjectURL(file));
    setImagePayload(null);
    setHandResult(null);
    setHandMetrics(initialHandMetrics());
    setHandStatus("idle");
    setRankedFoods([]);
    setSelectedFood(null);
    setRankingStatus("idle");
    setWeightEstimate(null);
    setWeightStatus("idle");
    setRankingError("");
    setWeightError("");
    const payload = await fileToImagePayload(file);
    setImagePayload(payload);
  }

  async function handleImageLoaded() {
    if (!imageRef.current) return;
    setHandStatus("detecting");
    setHandError("");
    try {
      const { detectHand } = await import("./lib/hand");
      const { result, metrics } = await detectHand(imageRef.current);
      setHandResult(result);
      setHandMetrics(metrics);
      setHandStatus(metrics.detected ? "detected" : "not-found");
    } catch (error) {
      setHandStatus("error");
      setHandError(error instanceof Error ? error.message : "手の検出に失敗しました。");
    }
  }

  async function handleEmbeddingRanking() {
    if (!apiKey.trim() || !imagePayload || !embeddingsFile) return;
    setRankingStatus("embedding");
    setRankingError("");
    try {
      if (!embeddingsReady) {
        throw new Error("食品名の事前 embedding が未生成です。手動検索で食品を選択してください。");
      }
      const imageVector = await embedImage(apiKey.trim(), imagePayload);
      const ranked = rankFoodsByEmbedding(foods, embeddingsFile.embeddings, imageVector, 20);
      setRankedFoods(ranked);
      setSelectedFood(ranked[0]?.food ?? null);
      setRankingStatus("ready");
    } catch (error) {
      setRankingStatus("error");
      setRankingError(error instanceof Error ? error.message : "食品ランキングに失敗しました。");
    }
  }

  function handleManualSearch(query: string) {
    setManualQuery(query);
    const results = rankFoodsByText(foods, query, 20);
    setRankedFoods(results);
    setRankingStatus(results.length > 0 ? "ready" : "idle");
  }

  async function handleWeightEstimate() {
    if (!apiKey.trim() || !imagePayload || !selectedFood) return;
    setWeightStatus("estimating");
    setWeightError("");
    try {
      const relatedFoods = rankedFoods.slice(0, 12).map((item) => item.food);
      const estimate = await estimateWeightWithGemini({
        apiKey: apiKey.trim(),
        image: imagePayload,
        selectedFood,
        relatedFoods,
        handMetrics,
        handSize,
        answers,
      });
      setWeightEstimate(estimate);
      setWeightStatus("ready");
    } catch (error) {
      setWeightStatus("error");
      setWeightError(error instanceof Error ? error.message : "可食部重量の推定に失敗しました。");
    }
  }

  function useFallbackEstimate() {
    if (!selectedFood) return;
    setWeightEstimate(fallbackWeightEstimate(selectedFood));
    setWeightStatus("ready");
    setWeightError("");
  }

  const completedSteps = [
    Boolean(imagePayload),
    handStatus === "detected" || handStatus === "not-found",
    Boolean(selectedFood),
    questions.length > 0,
    Boolean(carbEstimate),
  ];

  return (
    <div className="app-shell">
      <aside className="workflow">
        <div className="brand">
          <div className="brand-mark">C</div>
          <div>
            <h1>カーボカウント研究アプリ</h1>
            <p>写真・手・食品成分表から糖質量を推定</p>
          </div>
        </div>

        <ol className="steps">
          {STEP_LABELS.map((label, index) => (
            <li className={completedSteps[index] ? "is-complete" : ""} key={label}>
              <span>{index + 1}</span>
              <strong>{label}</strong>
            </li>
          ))}
        </ol>

        <div className="notice">
          <AlertTriangle size={18} />
          <p>研究目的の参考値です。医療機器ではなく、治療判断や投与量の決定には使わないでください。</p>
        </div>
      </aside>

      <main className="workspace">
        <header className="topbar">
          <div className="api-control">
            <label htmlFor="api-key">
              <KeyRound size={16} />
              Gemini API キー
            </label>
            <input
              id="api-key"
              type="password"
              autoComplete="off"
              value={apiKey}
              placeholder="保存されません。毎回入力してください。"
              onChange={(event) => {
                setApiKey(event.target.value);
                setConnectionStatus("idle");
              }}
            />
            <button disabled={!apiKey || connectionStatus === "testing"} onClick={handleConnectionTest} type="button">
              {connectionStatus === "testing" ? <Loader2 className="spin" size={16} /> : <Sparkles size={16} />}
              接続テスト
            </button>
          </div>
          <div className={`status-pill ${connectionStatus}`}>
            {connectionStatus === "ok" ? <CheckCircle2 size={16} /> : <Eye size={16} />}
            {connectionStatus === "ok" ? "接続OK" : connectionStatus === "error" ? "接続エラー" : "未接続"}
          </div>
        </header>
        {connectionError ? <div className="error-bar">{connectionError}</div> : null}
        {foodLoadError ? <div className="error-bar">食品データを読み込めませんでした: {foodLoadError}</div> : null}

        <section className="grid">
          <div className="left-pane">
            <section className="panel upload-panel">
              <div className="section-heading">
                <h2>アップロードした写真</h2>
                <label className="secondary-button">
                  <ImagePlus size={16} />
                  写真を選ぶ
                  <input accept="image/*" hidden type="file" onChange={(event) => handleFileChange(event.target.files?.[0] ?? null)} />
                </label>
              </div>
              <div className="image-stage">
                {imageUrl ? (
                  <>
                    <img alt="アップロードした食品写真" onLoad={handleImageLoaded} ref={imageRef} src={imageUrl} />
                    <HandOverlay result={handResult} />
                  </>
                ) : (
                  <div className="empty-state">
                    <ImagePlus size={42} />
                    <p>手が写った食品写真をアップロードしてください。</p>
                  </div>
                )}
              </div>
              <div className="media-status">
                {handStatus === "detecting" ? (
                  <span>
                    <Loader2 className="spin" size={16} /> 手を検出中
                  </span>
                ) : null}
                {handStatus === "detected" ? (
                  <span className="ok">
                    <CheckCircle2 size={16} /> 手を検出しました（信頼度 {handMetrics.confidence.toFixed(2)}）
                  </span>
                ) : null}
                {handStatus === "not-found" ? (
                  <span className="warn">
                    <AlertTriangle size={16} /> 手を検出できませんでした。写真を選び直すか、手サイズの仮定で進んでください。
                  </span>
                ) : null}
                {handStatus === "error" ? <span className="warn">{handError}</span> : null}
              </div>
            </section>

            <section className="panel">
              <div className="section-heading">
                <h2>手の大きさ</h2>
                <span className="helper">実寸の目安</span>
              </div>
              <div className="segmented">
                {[
                  ["small", "小さめ", "一般的な女性より小さい"],
                  ["standard", "標準", "一般的な成人の平均"],
                  ["large", "大きめ", "一般的な男性より大きい"],
                ].map(([value, label, description]) => (
                  <button
                    className={handSize === value ? "is-active" : ""}
                    key={value}
                    type="button"
                    onClick={() => setHandSize(value as HandSize)}
                  >
                    <strong>{label}</strong>
                    <span>{description}</span>
                  </button>
                ))}
              </div>
            </section>

            <section className="panel">
              <div className="section-heading">
                <div>
                  <h2>食品候補ランキング</h2>
                  <p>Embedding 類似度または手動検索で食品を確定します。</p>
                </div>
                <button
                  disabled={!apiKey || !imagePayload || rankingStatus === "embedding"}
                  onClick={handleEmbeddingRanking}
                  type="button"
                >
                  {rankingStatus === "embedding" ? <Loader2 className="spin" size={16} /> : <Sparkles size={16} />}
                  画像embedding
                </button>
              </div>
              {!embeddingsReady ? (
                <div className="info-bar">
                  食品名の事前 embedding は未生成です。npm run data:embeddings 実行後にランキングが有効になります。
                  {embeddingLoadError ? ` (${embeddingLoadError})` : ""}
                </div>
              ) : null}
              {rankingError ? <div className="error-bar">{rankingError}</div> : null}
              <div className="search-box">
                <Search size={16} />
                <input
                  value={manualQuery}
                  placeholder="例: サンドイッチ、コーヒー、食パン"
                  onChange={(event) => handleManualSearch(event.target.value)}
                />
              </div>
              <div className="ranking-list">
                {rankedFoods.slice(0, 8).map((item) => (
                  <button
                    className={selectedFood?.id === item.food.id ? "rank-row is-selected" : "rank-row"}
                    key={`${item.source}-${item.food.id}`}
                    type="button"
                    onClick={() => {
                      setSelectedFood(item.food);
                      if (item.source === "text") setRankedFoods([manualRank(item.food), ...rankedFoods.filter((rank) => rank.food.id !== item.food.id)]);
                    }}
                  >
                    <span className="rank-number">{item.rank}</span>
                    <span>
                      <strong>{item.food.name}</strong>
                      <small>
                        {item.food.groupName} / {item.food.carbAvailableGPer100g ?? "不明"} g/100g
                      </small>
                    </span>
                    <em>{item.source === "embedding" ? item.score.toFixed(3) : "選択"}</em>
                  </button>
                ))}
                {rankedFoods.length === 0 ? <p className="muted">候補がまだありません。検索語を入力してください。</p> : null}
              </div>
            </section>
          </div>

          <div className="right-pane">
            <section className="panel">
              <div className="section-heading">
                <div>
                  <h2>追加の質問</h2>
                  <p>{selectedFood ? `選択中: ${selectedFood.name}` : "食品を選ぶと質問が表示されます。"}</p>
                </div>
              </div>
              {selectedFood ? (
                <QuestionForm
                  questions={questions}
                  values={questionValues}
                  onChange={(id, value) => setQuestionValues((current) => ({ ...current, [id]: value }))}
                />
              ) : (
                <div className="empty-state compact">食品候補を選択してください。</div>
              )}
            </section>

            <section className="panel estimate-panel">
              <div className="section-heading">
                <div>
                  <h2>可食部重量の推定</h2>
                  <p>写真・手の大きさ・質問回答を Gemini 3.5 Flash に渡します。</p>
                </div>
                <button
                  disabled={!apiKey || !imagePayload || !selectedFood || weightStatus === "estimating"}
                  onClick={handleWeightEstimate}
                  type="button"
                >
                  {weightStatus === "estimating" ? <Loader2 className="spin" size={16} /> : <Sparkles size={16} />}
                  推定開始
                </button>
              </div>
              {weightStatus === "estimating" ? (
                <div className="progress-card">
                  <Loader2 className="spin" size={24} />
                  <div>
                    <strong>LLM 推定中</strong>
                    <p>応答を待つ間に追加質問を編集できます。</p>
                  </div>
                </div>
              ) : null}
              {weightError ? (
                <div className="error-card">
                  <AlertTriangle size={18} />
                  <p>{weightError}</p>
                  <button type="button" onClick={useFallbackEstimate}>
                    暫定値で結果表示
                  </button>
                </div>
              ) : null}
              {weightEstimate ? (
                <div className="weight-summary">
                  <span>可食部重量</span>
                  <strong>{formatNumber(weightEstimate.edibleGrams)} g</strong>
                  <small>
                    範囲 {formatNumber(weightEstimate.minEdibleGrams)} - {formatNumber(weightEstimate.maxEdibleGrams)} g / 信頼度{" "}
                    {Math.round(weightEstimate.confidence * 100)}%
                  </small>
                </div>
              ) : null}
            </section>

            <section className="panel result-panel">
              <div className="section-heading">
                <h2>推定結果</h2>
                {carbEstimate ? (
                  <button
                    className="secondary-button"
                    type="button"
                    onClick={() =>
                      downloadJson("carb-estimate.json", {
                        selectedFood,
                        handMetrics,
                        handSize,
                        answers,
                        weightEstimate,
                        carbEstimate,
                      })
                    }
                  >
                    <FileJson size={16} />
                    JSON保存
                  </button>
                ) : null}
              </div>
              {carbEstimate ? (
                <>
                  <div className="result-metrics">
                    <div>
                      <span>炭水化物量</span>
                      <strong>{formatNumber(carbEstimate.totalCarbsG)} g</strong>
                      <small>
                        範囲 {formatNumber(carbEstimate.minCarbsG)} - {formatNumber(carbEstimate.maxCarbsG)} g
                      </small>
                    </div>
                    <div>
                      <span>可食部重量</span>
                      <strong>{formatNumber(carbEstimate.edibleGrams)} g</strong>
                      <small>
                        範囲 {formatNumber(carbEstimate.minEdibleGrams)} - {formatNumber(carbEstimate.maxEdibleGrams)} g
                      </small>
                    </div>
                    <div>
                      <span>参照値</span>
                      <strong>{formatNumber(selectedFood?.carbAvailableGPer100g ?? 0)} g</strong>
                      <small>100gあたり利用可能炭水化物</small>
                    </div>
                  </div>
                  <div className="component-table">
                    {carbEstimate.components.map((component, index) => (
                      <div key={`${component.label}-${index}`}>
                        <span>{component.label}</span>
                        <em>{component.source === "question" ? "質問反映" : `${formatNumber(component.grams)} g`}</em>
                        <strong>{formatNumber(component.carbsG)} g</strong>
                      </div>
                    ))}
                  </div>
                  <p className="rationale">根拠: {carbEstimate.rationale}</p>
                  <div className="caution">
                    <AlertTriangle size={18} />
                    <p>{carbEstimate.caution}</p>
                  </div>
                </>
              ) : (
                <div className="empty-state compact">食品を選択し、可食部重量を推定すると結果が表示されます。</div>
              )}
            </section>
          </div>
        </section>

        <footer className="footer">
          <button type="button" onClick={() => window.location.reload()}>
            <RefreshCcw size={16} />
            リセット
          </button>
          <button type="button" onClick={() => downloadJson("foods-source-summary.json", { count: foods.length, source: foods[0]?.source })}>
            <Download size={16} />
            データ概要
          </button>
        </footer>
      </main>
    </div>
  );
}
