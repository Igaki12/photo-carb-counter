import { describe, expect, it } from "vitest";
import { manualRank, rankFoodsByEmbedding, rankFoodsByText } from "../src/lib/ranking";
import type { FoodEmbedding, FoodItem } from "../src/types/domain";

const foods: FoodItem[] = [
  {
    id: "food-a",
    foodNo: "00001",
    indexNo: "1",
    group: "01",
    groupName: "穀類",
    name: "食パン",
    searchText: "食パン",
    carbAvailableGPer100g: 44.2,
    carbMonosaccharideEqGPer100g: 48.2,
    isEstimated: false,
    isTrace: false,
    raw: { carbAvailable: "44.2", carbMonosaccharideEq: "48.2" },
    note: "",
    source: { name: "test", sheet: "test", unit: "test" },
  },
  {
    id: "food-b",
    foodNo: "00002",
    indexNo: "2",
    group: "16",
    groupName: "し好飲料類",
    name: "コーヒー",
    searchText: "コーヒー",
    carbAvailableGPer100g: 0,
    carbMonosaccharideEqGPer100g: 0,
    isEstimated: false,
    isTrace: false,
    raw: { carbAvailable: "0", carbMonosaccharideEq: "0" },
    note: "",
    source: { name: "test", sheet: "test", unit: "test" },
  },
];

describe("food ranking", () => {
  it("orders normalized dot product scores", () => {
    const embeddings: FoodEmbedding[] = [
      { foodId: "food-a", vector: [1, 0], model: "test", dimensionality: 2, normalized: true },
      { foodId: "food-b", vector: [0, 1], model: "test", dimensionality: 2, normalized: true },
    ];
    const ranked = rankFoodsByEmbedding(foods, embeddings, [0.9, 0.1]);
    expect(ranked[0].food.id).toBe("food-a");
  });

  it("supports text ranking and manual override", () => {
    const ranked = rankFoodsByText(foods, "コーヒー");
    expect(ranked[0].food.id).toBe("food-b");
    expect(manualRank(foods[0]).source).toBe("manual");
  });
});
