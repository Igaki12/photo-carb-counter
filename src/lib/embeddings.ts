import type { FoodEmbedding, FoodEmbeddingFile } from "../types/domain";

export function mergeFoodEmbeddingFiles(files: FoodEmbeddingFile[]): FoodEmbeddingFile {
  if (files.length === 0) {
    throw new Error("食品embeddingファイルがありません。");
  }

  const [baseFile] = files;
  const embeddingByFoodId = new Map<string, FoodEmbedding>();

  for (const file of files) {
    if (file.model !== baseFile.model || file.outputDimensionality !== baseFile.outputDimensionality) {
      throw new Error("食品embeddingファイルのモデルまたは次元数が一致しません。");
    }
    for (const embedding of file.embeddings) {
      if (
        embedding.model !== baseFile.model ||
        embedding.dimensionality !== baseFile.outputDimensionality ||
        embedding.vector.length !== baseFile.outputDimensionality
      ) {
        throw new Error(`食品embeddingの形式が不正です: ${embedding.foodId}`);
      }
      if (embeddingByFoodId.has(embedding.foodId)) {
        throw new Error(`食品embeddingのIDが重複しています: ${embedding.foodId}`);
      }
      embeddingByFoodId.set(embedding.foodId, embedding);
    }
  }

  return {
    model: baseFile.model,
    outputDimensionality: baseFile.outputDimensionality,
    generatedAt: files.find((file) => file.generatedAt)?.generatedAt ?? null,
    status: files.every((file) => file.status === "complete") ? "complete" : "partial",
    count: embeddingByFoodId.size,
    embeddings: Array.from(embeddingByFoodId.values()),
  };
}
