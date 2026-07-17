import { readFileSync, statSync } from "node:fs";
import { describe, expect, it } from "vitest";
import foods from "../src/data/foods.json";
import { rankFoodsByText } from "../src/lib/ranking";
import type { FoodItem } from "../src/types/domain";

const foodItems = foods as FoodItem[];
const fnddsFoods = foodItems.filter((food) => food.id.startsWith("fdc-"));
const mextFoods = foodItems.filter((food) => food.id.startsWith("mext-"));

describe("food composition data", () => {
  it("combines FNDDS and MEXT rows with unique IDs", () => {
    expect(foodItems).toHaveLength(7970);
    expect(fnddsFoods).toHaveLength(5432);
    expect(mextFoods).toHaveLength(2538);
    expect(new Set(foodItems.map((food) => food.id)).size).toBe(7970);
    expect(foodItems.filter((food) => food.carbAvailableGPer100g !== null)).toHaveLength(7969);
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
    expect(rankFoodsByText(foodItems, "ポテトコロッケ").some((item) => item.food.id.startsWith("mext-"))).toBe(true);
  });

  it("extracts MEXT CHOCDF- values and source metadata", () => {
    const rice = foodItems.find((food) => food.id === "mext-01088");
    expect(rice?.name).toBe("こめ ［水稲めし］ 精白米 うるち米");
    expect(rice?.carbAvailableGPer100g).toBe(37.1);
    expect(rice?.source).toEqual({
      name: "日本食品標準成分表（八訂）増補2023年",
      sheet: "表全体",
      unit: "可食部100 g当たり",
    });

    const frozenCroquette = foodItems.find((food) => food.id === "mext-18007");
    expect(frozenCroquette?.carbAvailableGPer100g).toBe(25.3);
    expect(frozenCroquette?.isEstimated).toBe(false);

    const preparedCroquette = foodItems.find((food) => food.id === "mext-18018");
    expect(preparedCroquette?.carbAvailableGPer100g).toBe(25.2);
    expect(preparedCroquette?.isEstimated).toBe(true);

    const traceFood = foodItems.find((food) => food.id === "mext-04084");
    expect(traceFood?.carbAvailableGPer100g).toBe(0);
    expect(traceFood?.isTrace).toBe(true);
  });

  it("keeps MEXT records minimal and within the expected carbohydrate range", () => {
    expect(
      mextFoods.every(
        (food) =>
          typeof food.carbAvailableGPer100g === "number" &&
          Number.isFinite(food.carbAvailableGPer100g) &&
          food.carbAvailableGPer100g >= 0 &&
          food.carbAvailableGPer100g <= 100,
      ),
    ).toBe(true);
    expect(
      mextFoods.every(
        (food) =>
          !("portions" in food) &&
          !("ingredients" in food) &&
          !("nutrients" in food) &&
          !("energyKcalPer100g" in food) &&
          !("proteinGPer100g" in food) &&
          !("fatGPer100g" in food),
      ),
    ).toBe(true);
  });

  it("writes identical minified source and public data below 15 MB", () => {
    const sourceUrl = new URL("../src/data/foods.json", import.meta.url);
    const publicUrl = new URL("../public/data/foods.json", import.meta.url);
    expect(statSync(sourceUrl).size).toBeLessThan(15_000_000);
    expect(readFileSync(sourceUrl).equals(readFileSync(publicUrl))).toBe(true);
  });
});
