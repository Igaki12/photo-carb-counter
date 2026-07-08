import { readFile, writeFile } from "node:fs/promises";

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  console.error("GEMINI_API_KEY is required.");
  process.exit(1);
}

const model = process.env.GEMINI_EMBEDDING_MODEL ?? "gemini-embedding-2";
const outputDimensionality = Number(process.env.GEMINI_EMBEDDING_DIM ?? 768);
const baseUrl = process.env.GEMINI_API_BASE ?? "https://generativelanguage.googleapis.com/v1beta";
const batchSize = Number(process.env.GEMINI_EMBEDDING_BATCH_SIZE ?? 1);

const foods = JSON.parse(await readFile("src/data/foods.json", "utf8"));

function normalize(vector) {
  const norm = Math.hypot(...vector);
  return norm > 0 ? vector.map((value) => value / norm) : vector;
}

async function embedFood(food) {
  const body = {
    model: `models/${model}`,
    content: {
      parts: [
        {
          text: `食品名: ${food.name}\n食品群: ${food.groupName}\n備考: ${food.note || "なし"}`,
        },
      ],
    },
    outputDimensionality,
  };

  const response = await fetch(`${baseUrl}/models/${model}:embedContent?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Embedding failed for ${food.foodNo}: ${response.status} ${text}`);
  }

  const data = await response.json();
  const values = data.embedding?.values;
  if (!Array.isArray(values)) {
    throw new Error(`Unexpected embedding response for ${food.foodNo}`);
  }

  return {
    foodId: food.id,
    vector: normalize(values),
    model,
    dimensionality: values.length,
    normalized: true,
  };
}

const embeddings = [];
for (let index = 0; index < foods.length; index += batchSize) {
  const chunk = foods.slice(index, index + batchSize);
  const results = await Promise.all(chunk.map(embedFood));
  embeddings.push(...results);
  console.log(`Embedded ${embeddings.length}/${foods.length}`);
}

await writeFile(
  "public/data/food-embeddings.json",
  JSON.stringify({ model, outputDimensionality, generatedAt: new Date().toISOString(), embeddings }, null, 2) + "\n",
);
