import { describe, expect, it } from "vitest";
import foods from "../src/data/foods.json";
import { calculateCarbEstimate } from "../src/lib/carb";
import type { FoodItem, WeightEstimate } from "../src/types/domain";

const foodItems = foods as FoodItem[];
const sandwich = foodItems.find((food) => food.name === "Cheese sandwich, NFS")!;
const rice = foodItems.find((food) => food.id === "mext-01088")!;

describe("carb calculation", () => {
  it("calculates a single food from grams and carbs per 100g", () => {
    const estimate: WeightEstimate = {
      selectedFoodName: sandwich.name,
      visibleComponents: [sandwich.name],
      edibleGrams: 50,
      minEdibleGrams: 40,
      maxEdibleGrams: 60,
      confidence: 0.8,
      rationale: "test",
      components: [{ label: sandwich.name, foodId: sandwich.id, grams: 50, minGrams: 40, maxGrams: 60 }],
    };

    const result = calculateCarbEstimate(sandwich, foodItems, estimate, []);
    expect(result.totalCarbsG).toBeCloseTo(16.0, 1);
    expect(result.minCarbsG).toBeCloseTo(12.8, 1);
    expect(result.maxCarbsG).toBeCloseTo(19.1, 1);
  });

  it("adds question-based carb adjustments", () => {
    const estimate: WeightEstimate = {
      selectedFoodName: sandwich.name,
      visibleComponents: [sandwich.name],
      edibleGrams: 50,
      minEdibleGrams: 50,
      maxEdibleGrams: 50,
      confidence: 0.8,
      rationale: "test",
      components: [{ label: sandwich.name, foodId: sandwich.id, grams: 50, minGrams: 50, maxGrams: 50 }],
    };

    const result = calculateCarbEstimate(sandwich, foodItems, estimate, [
      { questionId: "added_sugar_tsp", label: "追加した砂糖", value: 2, unit: "小さじ", carbAdjustmentG: 6 },
    ]);
    expect(result.totalCarbsG).toBeCloseTo(22.0, 1);
  });

  it("calculates MEXT foods from CHOCDF- per 100g values", () => {
    const estimate: WeightEstimate = {
      selectedFoodName: rice.name,
      visibleComponents: [rice.name],
      edibleGrams: 150,
      minEdibleGrams: 120,
      maxEdibleGrams: 180,
      confidence: 0.8,
      rationale: "test",
      components: [{ label: rice.name, foodId: rice.id, grams: 150, minGrams: 120, maxGrams: 180 }],
    };

    const result = calculateCarbEstimate(rice, foodItems, estimate, []);
    expect(result.totalCarbsG).toBe(55.7);
    expect(result.minCarbsG).toBe(44.5);
    expect(result.maxCarbsG).toBe(66.8);
  });
});
