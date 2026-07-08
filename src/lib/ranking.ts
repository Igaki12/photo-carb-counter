import type { FoodEmbedding, FoodItem, RankedFood } from "../types/domain";
import { dotProduct, normalizeVector } from "./vector";

const JAPANESE_SPACE = /\s+/g;

export function rankFoodsByEmbedding(
  foods: FoodItem[],
  embeddings: FoodEmbedding[],
  imageVector: number[],
  limit = 20,
): RankedFood[] {
  const foodById = new Map(foods.map((food) => [food.id, food]));
  const normalizedImage = normalizeVector(imageVector);

  const ranked: RankedFood[] = [];
  for (const embedding of embeddings) {
      const food = foodById.get(embedding.foodId);
      if (!food) continue;
      const vector = embedding.normalized ? embedding.vector : normalizeVector(embedding.vector);
      ranked.push({
        food,
        score: dotProduct(normalizedImage, vector),
        rank: 0,
        source: "embedding",
      });
  }

  return ranked
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((item, index) => ({ ...item, rank: index + 1 }));
}

export function rankFoodsByText(foods: FoodItem[], query: string, limit = 20): RankedFood[] {
  const tokens = query
    .trim()
    .replace(JAPANESE_SPACE, " ")
    .split(" ")
    .filter(Boolean);

  const scored = foods.map((food) => {
    const haystack = `${food.name} ${food.groupName} ${food.note}`.toLowerCase();
    const score =
      tokens.length === 0
        ? 0
        : tokens.reduce((total, token) => total + (haystack.includes(token.toLowerCase()) ? 1 : 0), 0) / tokens.length;
    return { food, score, rank: 0, source: "text" as const };
  });

  return scored
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.food.name.localeCompare(b.food.name, "ja"))
    .slice(0, limit)
    .map((item, index) => ({ ...item, rank: index + 1 }));
}

export function manualRank(food: FoodItem): RankedFood {
  return { food, score: 1, rank: 1, source: "manual" };
}
