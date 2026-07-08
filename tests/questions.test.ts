import { describe, expect, it } from "vitest";
import foods from "../src/data/foods.json";
import { getQuestionsForFood } from "../src/lib/questions";
import type { FoodItem } from "../src/types/domain";

const foodItems = foods as FoodItem[];

describe("question rules", () => {
  it("asks beverage questions for coffee without rice/staple false positives from notes", () => {
    const coffee = foodItems.find((food) => food.foodNo === "16045")!;
    const labels = getQuestionsForFood(coffee).map((question) => question.label);
    expect(labels).toContain("追加した砂糖");
    expect(labels).not.toContain("主食の個数・枚数");
  });

  it("asks bread and filling questions for bread-like foods", () => {
    const bread = foodItems.find((food) => food.foodNo === "01026")!;
    const labels = getQuestionsForFood(bread).map((question) => question.label);
    expect(labels).toContain("主食の個数・枚数");
    expect(labels).toContain("マヨネーズ・ドレッシング");
  });
});
