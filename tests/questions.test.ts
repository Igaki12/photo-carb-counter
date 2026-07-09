import { describe, expect, it } from "vitest";
import foods from "../src/data/foods.json";
import { getQuestionsForFood } from "../src/lib/questions";
import type { FoodItem } from "../src/types/domain";

const foodItems = foods as FoodItem[];

describe("question rules", () => {
  it("asks beverage questions for coffee without rice/staple false positives from notes", () => {
    const coffee = foodItems.find((food) => food.name === "Coffee, Latte")!;
    const labels = getQuestionsForFood(coffee).map((question) => question.label);
    expect(labels).toContain("追加した砂糖");
    expect(labels).not.toContain("主食の個数・枚数");
  });

  it("asks staple and filling questions for sandwich-like foods", () => {
    const sandwich = foodItems.find((food) => food.name === "Cheese sandwich, NFS")!;
    const labels = getQuestionsForFood(sandwich).map((question) => question.label);
    expect(labels).toContain("主食の個数・枚数");
    expect(labels).toContain("マヨネーズ・ドレッシング");
  });

  it("asks sweet questions for dessert foods", () => {
    const iceCream = foodItems.find((food) => food.name === "Ice cream sandwich, vanilla")!;
    const labels = getQuestionsForFood(iceCream).map((question) => question.label);
    expect(labels).toContain("クリーム・ジャム・シロップの追加");
  });
});
