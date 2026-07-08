import { describe, expect, it } from "vitest";
import foods from "../src/data/foods.json";
import type { FoodItem } from "../src/types/domain";

const foodItems = foods as FoodItem[];

describe("food composition data", () => {
  it("contains the converted workbook rows", () => {
    expect(foodItems).toHaveLength(1101);
  });

  it("parses parenthesized estimated values as numeric values with an estimated flag", () => {
    const awaMochi = foodItems.find((food) => food.foodNo === "01003");
    expect(awaMochi?.carbAvailableGPer100g).toBe(40.5);
    expect(awaMochi?.isEstimated).toBe(true);
  });

  it("contains coffee, sugar, milk, and bread rows used by question rules", () => {
    expect(foodItems.some((food) => /コーヒー/.test(food.name))).toBe(true);
    expect(foodItems.some((food) => /上白糖/.test(food.name))).toBe(true);
    expect(foodItems.some((food) => /普通牛乳/.test(food.name))).toBe(true);
    expect(foodItems.some((food) => /食パン/.test(food.name))).toBe(true);
  });
});
