import { describe, expect, it } from "vitest";
import { mergeFoodEmbeddingFiles } from "../src/lib/embeddings";
import type { FoodEmbeddingFile } from "../src/types/domain";

function file(foodId: string, vector: number[], overrides: Partial<FoodEmbeddingFile> = {}): FoodEmbeddingFile {
  return {
    model: "test-model",
    outputDimensionality: 2,
    generatedAt: "2026-07-17T00:00:00.000Z",
    status: "complete",
    count: 1,
    embeddings: [
      {
        foodId,
        vector,
        model: "test-model",
        dimensionality: 2,
        normalized: true,
      },
    ],
    ...overrides,
  };
}

describe("food embedding files", () => {
  it("merges FNDDS with partial MEXT embeddings", () => {
    const merged = mergeFoodEmbeddingFiles([
      file("fdc-1", [1, 0]),
      file("mext-1", [0, 1], { generatedAt: null, status: "partial" }),
    ]);

    expect(merged.generatedAt).toBe("2026-07-17T00:00:00.000Z");
    expect(merged.status).toBe("partial");
    expect(merged.count).toBe(2);
    expect(merged.embeddings.map((embedding) => embedding.foodId)).toEqual(["fdc-1", "mext-1"]);
  });

  it("rejects incompatible or duplicate embedding files", () => {
    expect(() =>
      mergeFoodEmbeddingFiles([file("fdc-1", [1, 0]), file("mext-1", [0, 1], { outputDimensionality: 3 })]),
    ).toThrow(/次元数が一致しません/);
    expect(() => mergeFoodEmbeddingFiles([file("fdc-1", [1, 0]), file("fdc-1", [0, 1])])).toThrow(
      /IDが重複しています/,
    );
  });
});
