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
const outputPath = process.env.GEMINI_EMBEDDING_OUTPUT ?? "public/data/food-embeddings.json";
const maxRetries = Number(process.env.GEMINI_EMBEDDING_RETRIES ?? 3);
const saveEvery = Number(process.env.GEMINI_EMBEDDING_SAVE_EVERY ?? 10);

const foods = JSON.parse(await readFile("src/data/foods.json", "utf8"));

function normalize(vector) {
  const norm = Math.hypot(...vector);
  return norm > 0 ? vector.map((value) => value / norm) : vector;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function readExistingEmbeddings() {
  try {
    const existing = JSON.parse(await readFile(outputPath, "utf8"));
    if (existing.model !== model || existing.outputDimensionality !== outputDimensionality) {
      console.warn(
        `Ignoring existing embeddings because model/dimension differ: ${existing.model}/${existing.outputDimensionality}`,
      );
      return [];
    }
    return Array.isArray(existing.embeddings) ? existing.embeddings : [];
  } catch {
    return [];
  }
}

async function saveEmbeddings(embeddings, status = "partial") {
  const payload = {
    model,
    outputDimensionality,
    generatedAt: status === "complete" ? new Date().toISOString() : null,
    status,
    savedAt: new Date().toISOString(),
    count: embeddings.length,
    embeddings,
  };
  await writeFile(outputPath, JSON.stringify(payload, null, 2) + "\n");
}

async function embedFoodOnce(food) {
  const body = {
    model: `models/${model}`,
    content: {
      parts: [
        {
          text: food.name,
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
    const error = new Error(`Embedding failed for ${food.foodNo}: ${response.status} ${text}`);
    error.status = response.status;
    throw error;
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

async function embedFood(food) {
  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    try {
      return await embedFoodOnce(food);
    } catch (error) {
      const retryable = [429, 500, 502, 503, 504].includes(error.status);
      if (!retryable || attempt === maxRetries) {
        throw error;
      }
      const delayMs = Math.round(1000 * 2 ** attempt + Math.random() * 500);
      console.warn(
        `Retrying ${food.foodNo} after ${error.status ?? "error"} (${attempt + 1}/${maxRetries}) in ${delayMs}ms`,
      );
      await sleep(delayMs);
    }
  }
  throw new Error(`Embedding failed for ${food.foodNo}`);
}

const embeddings = await readExistingEmbeddings();
const embeddingByFoodId = new Map(embeddings.map((embedding) => [embedding.foodId, embedding]));
let completedSinceSave = 0;

console.log(`Loaded ${embeddingByFoodId.size}/${foods.length} existing embeddings from ${outputPath}`);

try {
  for (let index = 0; index < foods.length; index += batchSize) {
    const chunk = foods.slice(index, index + batchSize).filter((food) => !embeddingByFoodId.has(food.id));
    if (chunk.length === 0) {
      continue;
    }

    const results = await Promise.all(chunk.map(embedFood));
    for (const result of results) {
      embeddingByFoodId.set(result.foodId, result);
    }

    completedSinceSave += results.length;
    const orderedEmbeddings = foods.map((food) => embeddingByFoodId.get(food.id)).filter(Boolean);
    console.log(`Embedded ${orderedEmbeddings.length}/${foods.length}`);

    if (completedSinceSave >= saveEvery) {
      await saveEmbeddings(orderedEmbeddings, "partial");
      completedSinceSave = 0;
    }
  }

  const orderedEmbeddings = foods.map((food) => embeddingByFoodId.get(food.id)).filter(Boolean);
  await saveEmbeddings(orderedEmbeddings, orderedEmbeddings.length === foods.length ? "complete" : "partial");

  if (orderedEmbeddings.length !== foods.length) {
    process.exitCode = 1;
    console.error(`Embedding generation incomplete: ${orderedEmbeddings.length}/${foods.length}`);
  } else {
    console.log(`Embedding generation complete: ${orderedEmbeddings.length}/${foods.length}`);
  }
} catch (error) {
  const orderedEmbeddings = foods.map((food) => embeddingByFoodId.get(food.id)).filter(Boolean);
  await saveEmbeddings(orderedEmbeddings, "partial");
  console.error(`Saved partial embeddings: ${orderedEmbeddings.length}/${foods.length}`);
  throw error;
}
