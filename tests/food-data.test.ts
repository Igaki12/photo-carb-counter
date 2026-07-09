import { describe, expect, it } from "vitest";
import foods from "../src/data/foods.json";
import type { FoodItem } from "../src/types/domain";

const foodItems = foods as FoodItem[];

describe("food composition data", () => {
  it("contains the converted FNDDS rows", () => {
    expect(foodItems).toHaveLength(5432);
  });

  it("extracts carbohydrate, sugar, fiber, portions, and FNDDS source metadata", () => {
    const latte = foodItems.find((food) => food.name === "Coffee, Latte");
    expect(latte?.id).toBe("fdc-2710386");
    expect(latte?.carbAvailableGPer100g).toBe(4.35);
    expect(latte?.totalSugarsGPer100g).toBe(4.06);
    expect(latte?.fiberGPer100g).toBe(0);
    expect(latte?.portions?.some((portion) => portion.description === "1 medium" && portion.gramWeight === 480)).toBe(true);
    expect(latte?.source.name).toBe("FoodData Central FNDDS 2021-2023");
  });

  it("contains real meal-like foods used by ranking and question rules", () => {
    expect(foodItems.some((food) => /Coffee, Latte/.test(food.name))).toBe(true);
    expect(foodItems.some((food) => /Cheese sandwich/.test(food.name))).toBe(true);
    expect(foodItems.some((food) => /Pizza, cheese/.test(food.name))).toBe(true);
    expect(foodItems.some((food) => /Hamburger/.test(food.name))).toBe(true);
  });
});
