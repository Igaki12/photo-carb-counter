import type { FoodItem, QuestionAnswer, QuestionDefinition } from "../types/domain";

function matches(food: FoodItem, pattern: RegExp): boolean {
  return pattern.test(`${food.name} ${food.groupName} ${food.note}`);
}

function matchesName(food: FoodItem, pattern: RegExp): boolean {
  return pattern.test(food.name);
}

export function getQuestionsForFood(food: FoodItem): QuestionDefinition[] {
  const questions: QuestionDefinition[] = [];

  if (food.group === "16" || matches(food, /コーヒー|茶|紅茶|飲料|ジュース|ココア|乳飲料/)) {
    questions.push(
      {
        id: "serving_volume_ml",
        label: "飲んだ量",
        kind: "number",
        unit: "mL",
        defaultValue: 250,
        required: true,
      },
      {
        id: "added_sugar_tsp",
        label: "追加した砂糖",
        kind: "number",
        unit: "小さじ",
        defaultValue: 0,
      },
      {
        id: "milk_amount",
        label: "ミルク・牛乳の追加",
        kind: "single",
        defaultValue: "none",
        options: [
          { value: "none", label: "なし", carbAdjustmentG: 0 },
          { value: "small", label: "少量", carbAdjustmentG: 2 },
          { value: "standard", label: "標準", carbAdjustmentG: 5 },
          { value: "large", label: "多め", carbAdjustmentG: 9 },
        ],
      },
      {
        id: "syrup",
        label: "シロップ・甘味ソース",
        kind: "single",
        defaultValue: "none",
        options: [
          { value: "none", label: "なし", carbAdjustmentG: 0 },
          { value: "small", label: "少量", carbAdjustmentG: 5 },
          { value: "standard", label: "標準", carbAdjustmentG: 12 },
          { value: "large", label: "多め", carbAdjustmentG: 20 },
        ],
      },
    );
  }

  if (food.group === "01" || matchesName(food, /パン|サンド|バンズ|米|ごはん|めし|めん|うどん|そば|中華めん|パスタ/)) {
    questions.push(
      {
        id: "portion_count",
        label: "主食の個数・枚数",
        kind: "number",
        unit: "個/枚",
        defaultValue: matches(food, /パン|サンド/) ? 2 : 1,
      },
      {
        id: "staple_type",
        label: "主食の種類",
        kind: "single",
        defaultValue: "standard",
        options: [
          { value: "standard", label: "標準" },
          { value: "wholegrain", label: "全粒粉・雑穀" },
          { value: "sweet", label: "甘い生地・菓子パン寄り", carbAdjustmentG: 8 },
          { value: "unknown", label: "不明" },
        ],
      },
    );
  }

  if (matchesName(food, /パン|サンド|バンズ|調理済み|ハンバーガー/)) {
    questions.push(
      {
        id: "spread",
        label: "マヨネーズ・ドレッシング",
        kind: "single",
        defaultValue: "unknown",
        options: [
          { value: "none", label: "なし", carbAdjustmentG: 0 },
          { value: "small", label: "少量", carbAdjustmentG: 1 },
          { value: "standard", label: "標準", carbAdjustmentG: 2 },
          { value: "unknown", label: "不明", carbAdjustmentG: 1 },
        ],
      },
      {
        id: "fillings",
        label: "見える具材",
        kind: "multi",
        defaultValue: [],
        options: [
          { value: "cheese", label: "チーズ", carbAdjustmentG: 0.5 },
          { value: "bacon_ham", label: "ベーコン・ハム", carbAdjustmentG: 0.5 },
          { value: "egg", label: "卵", carbAdjustmentG: 0.3 },
          { value: "potato", label: "ポテトサラダ", carbAdjustmentG: 8 },
          { value: "sweet_sauce", label: "甘いソース", carbAdjustmentG: 6 },
        ],
      },
    );
  }

  if (food.group === "15" || matches(food, /菓子|ケーキ|チョコ|ゼリー|ジャム|デザート|アイス/)) {
    questions.push({
      id: "sweet_extra",
      label: "クリーム・ジャム・シロップの追加",
      kind: "single",
      defaultValue: "unknown",
      options: [
        { value: "none", label: "なし", carbAdjustmentG: 0 },
        { value: "small", label: "少量", carbAdjustmentG: 6 },
        { value: "standard", label: "標準", carbAdjustmentG: 14 },
        { value: "unknown", label: "不明", carbAdjustmentG: 7 },
      ],
    });
  }

  if (food.group === "07" || matchesName(food, /果実|フルーツ|りんご|みかん|バナナ|いちご/)) {
    questions.push({
      id: "peel_seed",
      label: "皮・種などを除いた量で見えていますか",
      kind: "single",
      defaultValue: "edible",
      options: [
        { value: "edible", label: "可食部のみ" },
        { value: "with_waste", label: "皮・種を含む" },
        { value: "unknown", label: "不明" },
      ],
    });
  }

  if (questions.length === 0) {
    questions.push({
      id: "extra_notes",
      label: "糖質量に影響しそうな追加情報",
      kind: "text",
      placeholder: "例: 甘いソースあり、半分だけ食べる、衣が厚い など",
    });
  }

  return questions;
}

export function answersToAdjustments(questions: QuestionDefinition[], values: Record<string, unknown>): QuestionAnswer[] {
  return questions.map((question) => {
    const raw = values[question.id] ?? question.defaultValue ?? "";
    let carbAdjustmentG = 0;

    if (question.id === "added_sugar_tsp" && typeof raw === "number") {
      carbAdjustmentG += raw * 3;
    }

    if (question.kind === "single") {
      const option = question.options?.find((item) => item.value === raw);
      carbAdjustmentG += option?.carbAdjustmentG ?? 0;
    }

    if (question.kind === "multi" && Array.isArray(raw)) {
      for (const value of raw) {
        const option = question.options?.find((item) => item.value === value);
        carbAdjustmentG += option?.carbAdjustmentG ?? 0;
      }
    }

    return {
      questionId: question.id,
      label: question.label,
      value: raw as string | number | string[],
      unit: question.unit,
      carbAdjustmentG,
    };
  });
}
