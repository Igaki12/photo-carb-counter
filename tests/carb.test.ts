import { describe, expect, it } from "vitest";
import foods from "../src/data/foods.json";
import { calculateCarbEstimate } from "../src/lib/carb";
import type { FoodItem, WeightEstimate } from "../src/types/domain";

const foodItems = foods as FoodItem[];
const bread = foodItems.find((food) => /角形食パン 食パン/.test(food.name))!;

describe("carb calculation", () => {
  it("calculates a single food from grams and carbs per 100g", () => {
    const estimate: WeightEstimate = {
      selectedFoodName: bread.name,
      visibleComponents: [bread.name],
      edibleGrams: 50,
      minEdibleGrams: 40,
      maxEdibleGrams: 60,
      confidence: 0.8,
      rationale: "test",
      components: [{ label: bread.name, foodId: bread.id, grams: 50, minGrams: 40, maxGrams: 60 }],
    };

    const result = calculateCarbEstimate(bread, foodItems, estimate, []);
    expect(result.totalCarbsG).toBeCloseTo(22.1, 1);
    expect(result.minCarbsG).toBeCloseTo(17.7, 1);
    expect(result.maxCarbsG).toBeCloseTo(26.5, 1);
  });

  it("adds question-based carb adjustments", () => {
    const estimate: WeightEstimate = {
      selectedFoodName: bread.name,
      visibleComponents: [bread.name],
      edibleGrams: 50,
      minEdibleGrams: 50,
      maxEdibleGrams: 50,
      confidence: 0.8,
      rationale: "test",
      components: [{ label: bread.name, foodId: bread.id, grams: 50, minGrams: 50, maxGrams: 50 }],
    };

    const result = calculateCarbEstimate(bread, foodItems, estimate, [
      { questionId: "added_sugar_tsp", label: "追加した砂糖", value: 2, unit: "小さじ", carbAdjustmentG: 6 },
    ]);
    expect(result.totalCarbsG).toBeCloseTo(28.1, 1);
  });
});
