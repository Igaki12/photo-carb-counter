import type { CarbComponent, CarbEstimate, FoodItem, QuestionAnswer, WeightEstimate } from "../types/domain";

export const CAUTION_TEXT =
  "本アプリの推定値は研究目的の参考値です。写真や入力情報により誤差を含む場合があります。治療判断やインスリン投与量の決定は医療専門職の指示に従ってください。";

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function carbsFor(food: FoodItem | undefined, grams: number): number {
  if (!food?.carbAvailableGPer100g) return 0;
  return (grams * food.carbAvailableGPer100g) / 100;
}

export function calculateCarbEstimate(
  selectedFood: FoodItem,
  foods: FoodItem[],
  weightEstimate: WeightEstimate,
  answers: QuestionAnswer[],
): CarbEstimate {
  const foodById = new Map(foods.map((food) => [food.id, food]));
  const components: CarbComponent[] = [];

  const sourceComponents =
    weightEstimate.components.length > 0
      ? weightEstimate.components
      : [
          {
            label: selectedFood.name,
            foodId: selectedFood.id,
            grams: weightEstimate.edibleGrams,
            minGrams: weightEstimate.minEdibleGrams,
            maxGrams: weightEstimate.maxEdibleGrams,
          },
        ];

  for (const component of sourceComponents) {
    const food = component.foodId ? foodById.get(component.foodId) : selectedFood;
    const fallbackFood = food ?? selectedFood;
    const grams = Math.max(0, component.grams);
    const minGrams = Math.max(0, component.minGrams);
    const maxGrams = Math.max(minGrams, component.maxGrams);
    components.push({
      label: component.label,
      food: fallbackFood,
      grams,
      minGrams,
      maxGrams,
      carbsG: round1(carbsFor(fallbackFood, grams)),
      minCarbsG: round1(carbsFor(fallbackFood, minGrams)),
      maxCarbsG: round1(carbsFor(fallbackFood, maxGrams)),
      source: "llm",
    });
  }

  for (const answer of answers) {
    if (!answer.carbAdjustmentG) continue;
    components.push({
      label: answer.label,
      grams: 0,
      minGrams: 0,
      maxGrams: 0,
      carbsG: round1(answer.carbAdjustmentG),
      minCarbsG: round1(Math.max(0, answer.carbAdjustmentG * 0.75)),
      maxCarbsG: round1(answer.carbAdjustmentG * 1.25),
      source: "question",
    });
  }

  const totalCarbsG = round1(components.reduce((total, component) => total + component.carbsG, 0));
  const minCarbsG = round1(components.reduce((total, component) => total + component.minCarbsG, 0));
  const maxCarbsG = round1(components.reduce((total, component) => total + component.maxCarbsG, 0));

  return {
    totalCarbsG,
    minCarbsG,
    maxCarbsG,
    edibleGrams: weightEstimate.edibleGrams,
    minEdibleGrams: weightEstimate.minEdibleGrams,
    maxEdibleGrams: weightEstimate.maxEdibleGrams,
    components,
    rationale: weightEstimate.rationale,
    caution: CAUTION_TEXT,
  };
}

export function fallbackWeightEstimate(food: FoodItem): WeightEstimate {
  const grams = food.group === "16" ? 250 : food.group === "01" ? 120 : 100;
  return {
    selectedFoodName: food.name,
    visibleComponents: [food.name],
    edibleGrams: grams,
    minEdibleGrams: Math.round(grams * 0.8),
    maxEdibleGrams: Math.round(grams * 1.2),
    confidence: 0.35,
    components: [
      {
        label: food.name,
        foodId: food.id,
        grams,
        minGrams: Math.round(grams * 0.8),
        maxGrams: Math.round(grams * 1.2),
        rationale: "LLM推定が利用できないため、食品カテゴリの一般的な量で仮置きしています。",
      },
    ],
    rationale: "LLM推定が利用できないため、一般的な一食量を用いた暫定値です。",
  };
}
