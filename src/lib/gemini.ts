import type { FoodItem, HandMetrics, HandSize, QuestionAnswer, WeightEstimate } from "../types/domain";
import { normalizeVector } from "./vector";

const API_BASE = "https://generativelanguage.googleapis.com/v1beta";
const EMBEDDING_MODEL = "gemini-embedding-2";
const GENERATION_MODEL = "gemini-3.5-flash";

export interface ImagePayload {
  mimeType: string;
  base64: string;
}

export async function fileToImagePayload(file: File, maxSize = 1280): Promise<ImagePayload> {
  const dataUrl = await resizeImage(file, maxSize);
  const [meta, base64] = dataUrl.split(",");
  const mimeType = /data:(.*);base64/.exec(meta)?.[1] ?? file.type;
  return { mimeType, base64 };
}

function resizeImage(file: File, maxSize: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("画像ファイルを読み込めませんでした。"));
    reader.onload = () => {
      image.onload = () => {
        const scale = Math.min(1, maxSize / Math.max(image.width, image.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(image.width * scale);
        canvas.height = Math.round(image.height * scale);
        const context = canvas.getContext("2d");
        if (!context) {
          reject(new Error("画像変換に失敗しました。"));
          return;
        }
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL(file.type || "image/jpeg", 0.88));
      };
      image.onerror = () => reject(new Error("画像を表示できませんでした。"));
      image.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

export async function testGeminiConnection(apiKey: string): Promise<void> {
  const response = await fetch(`${API_BASE}/models/${GENERATION_MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: "Reply with OK." }] }],
      generationConfig: { maxOutputTokens: 8 },
    }),
  });
  if (!response.ok) {
    throw new Error(await response.text());
  }
}

export async function embedImage(apiKey: string, image: ImagePayload): Promise<number[]> {
  const response = await fetch(`${API_BASE}/models/${EMBEDDING_MODEL}:embedContent?key=${encodeURIComponent(apiKey)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: `models/${EMBEDDING_MODEL}`,
      content: {
        parts: [{ inlineData: { mimeType: image.mimeType, data: image.base64 } }],
      },
      outputDimensionality: 768,
    }),
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }
  const data = await response.json();
  const values = data.embedding?.values;
  if (!Array.isArray(values)) {
    throw new Error("画像 embedding のレスポンス形式が想定外です。");
  }
  return normalizeVector(values);
}

const weightSchema = {
  type: "OBJECT",
  required: [
    "selectedFoodName",
    "visibleComponents",
    "edibleGrams",
    "minEdibleGrams",
    "maxEdibleGrams",
    "confidence",
    "components",
    "rationale",
  ],
  properties: {
    selectedFoodName: { type: "STRING" },
    visibleComponents: { type: "ARRAY", items: { type: "STRING" } },
    edibleGrams: { type: "INTEGER" },
    minEdibleGrams: { type: "INTEGER" },
    maxEdibleGrams: { type: "INTEGER" },
    confidence: { type: "NUMBER" },
    components: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        required: ["label", "foodId", "grams", "minGrams", "maxGrams", "rationale"],
        properties: {
          label: { type: "STRING" },
          foodId: { type: "STRING" },
          grams: { type: "INTEGER" },
          minGrams: { type: "INTEGER" },
          maxGrams: { type: "INTEGER" },
          rationale: { type: "STRING" },
        },
      },
    },
    rationale: { type: "STRING" },
  },
};

export async function estimateWeightWithGemini(params: {
  apiKey: string;
  image: ImagePayload;
  selectedFood: FoodItem;
  relatedFoods: FoodItem[];
  handMetrics: HandMetrics;
  handSize: HandSize;
  answers: QuestionAnswer[];
}): Promise<WeightEstimate> {
  const { apiKey, image, selectedFood, relatedFoods, handMetrics, handSize, answers } = params;
  const prompt = [
    "あなたは糖尿病研究用カーボカウント支援アプリの食品重量推定モジュールです。",
    "写真、手の検出情報、選択された食品、追加質問の回答から、可食部重量を整数グラムで推定してください。",
    "医療判断やインスリン量は出力しないでください。",
    "サンドイッチなど複合食品では、可能ならパン・具材・ソースなど主要部品に分けてください。",
    "component.foodId は、最も近い食品成分表項目の id を指定してください。不明な部品は選択食品の id を使ってください。",
    "",
    `選択食品: ${selectedFood.id} ${selectedFood.name} (${selectedFood.groupName})`,
    `100gあたり炭水化物: ${selectedFood.carbAvailableGPer100g ?? "不明"} g`,
    `手の検出: ${handMetrics.detected ? "あり" : "なし"}, 信頼度: ${handMetrics.confidence.toFixed(2)}, 手サイズ: ${handSize}`,
    `手の境界ボックス: ${handMetrics.boundingBox ? JSON.stringify(handMetrics.boundingBox) : "なし"}`,
    `候補食品: ${relatedFoods.map((food) => `${food.id}:${food.name}`).join(" / ")}`,
    `追加回答: ${answers.map((answer) => `${answer.label}=${Array.isArray(answer.value) ? answer.value.join(",") : answer.value}${answer.unit ?? ""}`).join(" / ") || "なし"}`,
    "根拠は80字以内の日本語にしてください。",
  ].join("\n");

  const response = await fetch(`${API_BASE}/models/${GENERATION_MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [
        {
          parts: [
            { text: prompt },
            { inlineData: { mimeType: image.mimeType, data: image.base64 } },
          ],
        },
      ],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: weightSchema,
        temperature: 0.2,
      },
    }),
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    throw new Error("LLM推定のレスポンスが空です。");
  }

  const parsed = JSON.parse(text) as WeightEstimate;
  return {
    ...parsed,
    edibleGrams: Math.max(0, Math.round(parsed.edibleGrams)),
    minEdibleGrams: Math.max(0, Math.round(parsed.minEdibleGrams)),
    maxEdibleGrams: Math.max(0, Math.round(parsed.maxEdibleGrams)),
    confidence: Math.max(0, Math.min(1, Number(parsed.confidence))),
    components: parsed.components.map((component) => ({
      ...component,
      grams: Math.max(0, Math.round(component.grams)),
      minGrams: Math.max(0, Math.round(component.minGrams)),
      maxGrams: Math.max(0, Math.round(component.maxGrams)),
    })),
  };
}
