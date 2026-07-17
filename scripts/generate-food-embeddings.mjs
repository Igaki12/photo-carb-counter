import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  console.error("GEMINI_API_KEY is required.");
  process.exit(1);
}

const model = process.env.GEMINI_EMBEDDING_MODEL ?? "gemini-embedding-2";
const outputDimensionality = Number(process.env.GEMINI_EMBEDDING_DIM ?? 768);
const baseUrl = process.env.GEMINI_API_BASE ?? "https://generativelanguage.googleapis.com/v1beta";
const batchSize = Number(process.env.GEMINI_EMBEDDING_BATCH_SIZE ?? 1);
const outputPath = process.env.GEMINI_EMBEDDING_OUTPUT ?? "public/data/mext-food-embeddings.json";
const maxRetries = Number(process.env.GEMINI_EMBEDDING_RETRIES ?? 3);
const saveEvery = Number(process.env.GEMINI_EMBEDDING_SAVE_EVERY ?? 10);

if (!Number.isInteger(outputDimensionality) || outputDimensionality <= 0) {
  throw new Error("GEMINI_EMBEDDING_DIM must be a positive integer.");
}
if (!Number.isInteger(batchSize) || batchSize <= 0) {
  throw new Error("GEMINI_EMBEDDING_BATCH_SIZE must be a positive integer.");
}
if (!Number.isInteger(saveEvery) || saveEvery <= 0) {
  throw new Error("GEMINI_EMBEDDING_SAVE_EVERY must be a positive integer.");
}

const allFoods = JSON.parse(await readFile("src/data/foods.json", "utf8"));
const foods = allFoods.filter((food) => food.id.startsWith("mext-") && !Number.isInteger(food.fdcId));
const eligibleFoodIds = new Set(foods.map((food) => food.id));

if (foods.length !== 2538 || eligibleFoodIds.size !== foods.length) {
  throw new Error(`Expected 2538 unique MEXT foods, found ${foods.length}/${eligibleFoodIds.size}.`);
}

function normalize(vector) {
  const norm = Math.hypot(...vector);
  return norm > 0 ? vector.map((value) => value / norm) : vector;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isValidEmbedding(embedding) {
  return (
    eligibleFoodIds.has(embedding?.foodId) &&
    Array.isArray(embedding.vector) &&
    embedding.vector.length === outputDimensionality &&
    embedding.vector.every(Number.isFinite)
  );
}

async function readExistingEmbeddingFile() {
  let existing;
  try {
    existing = JSON.parse(await readFile(outputPath, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") {
      return { status: "empty", embeddings: [] };
    }
    throw new Error(`Could not read existing embedding checkpoint at ${outputPath}: ${error.message}`, {
      cause: error,
    });
  }

  if (existing.model !== model || existing.outputDimensionality !== outputDimensionality) {
    console.warn(
      `Starting MEXT embeddings from zero because model/dimension differ: ${existing.model}/${existing.outputDimensionality}`,
    );
    return { status: "empty", embeddings: [] };
  }

  const embeddings = Array.isArray(existing.embeddings) ? existing.embeddings.filter(isValidEmbedding) : [];
  if (embeddings.length !== (existing.embeddings?.length ?? 0)) {
    console.warn(`Ignored ${(existing.embeddings?.length ?? 0) - embeddings.length} invalid or non-MEXT embeddings.`);
  }
  return { status: existing.status, embeddings };
}

let saveCounter = 0;

async function saveEmbeddings(embeddings, status = "partial") {
  const payload = {
    model,
    outputDimensionality,
    generatedAt: status === "complete" ? new Date().toISOString() : null,
    status,
    savedAt: new Date().toISOString(),
    count: embeddings.length,
    scope: "mext",
    embeddings,
  };
  const temporaryPath = `${outputPath}.tmp-${process.pid}-${saveCounter++}`;
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(temporaryPath, JSON.stringify(payload) + "\n");
  await rename(temporaryPath, outputPath);
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
  if (!Array.isArray(values) || values.length !== outputDimensionality || !values.every(Number.isFinite)) {
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

const existing = await readExistingEmbeddingFile();
const embeddingByFoodId = new Map(existing.embeddings.map((embedding) => [embedding.foodId, embedding]));
let completedSinceSave = 0;
let savingAfterSignal = false;

function orderedEmbeddings() {
  return foods.map((food) => embeddingByFoodId.get(food.id)).filter(Boolean);
}

async function savePartialAndExit(signal) {
  if (savingAfterSignal) return;
  savingAfterSignal = true;
  const embeddings = orderedEmbeddings();
  console.warn(`Received ${signal}; saving ${embeddings.length}/${foods.length} MEXT embeddings before exit.`);
  try {
    await saveEmbeddings(embeddings, "partial");
    process.exit(130);
  } catch (error) {
    console.error(`Could not save MEXT embeddings after ${signal}: ${error.message}`);
    process.exit(1);
  }
}

process.once("SIGINT", () => {
  void savePartialAndExit("SIGINT");
});
process.once("SIGTERM", () => {
  void savePartialAndExit("SIGTERM");
});

console.log(`Loaded ${embeddingByFoodId.size}/${foods.length} existing MEXT embeddings from ${outputPath}`);

if (embeddingByFoodId.size === foods.length && existing.status === "complete") {
  console.log("MEXT embedding generation is already complete.");
} else {
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
      const embeddings = orderedEmbeddings();
      console.log(`Embedded ${embeddings.length}/${foods.length} MEXT foods`);

      if (completedSinceSave >= saveEvery) {
        await saveEmbeddings(embeddings, "partial");
        completedSinceSave = 0;
      }
    }

    const embeddings = orderedEmbeddings();
    const status = embeddings.length === foods.length ? "complete" : "partial";
    await saveEmbeddings(embeddings, status);

    if (status !== "complete") {
      process.exitCode = 1;
      console.error(`MEXT embedding generation incomplete: ${embeddings.length}/${foods.length}`);
    } else {
      console.log(`MEXT embedding generation complete: ${embeddings.length}/${foods.length}`);
    }
  } catch (error) {
    const embeddings = orderedEmbeddings();
    await saveEmbeddings(embeddings, "partial");
    console.error(`Saved partial MEXT embeddings: ${embeddings.length}/${foods.length}`);
    throw error;
  }
}
