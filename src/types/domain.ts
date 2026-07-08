export type HandSize = "small" | "standard" | "large";

export interface FoodItem {
  id: string;
  foodNo: string;
  indexNo: string;
  group: string;
  groupName: string;
  name: string;
  searchText: string;
  carbAvailableGPer100g: number | null;
  carbMonosaccharideEqGPer100g: number | null;
  isEstimated: boolean;
  isTrace: boolean;
  raw: {
    carbAvailable: string;
    carbMonosaccharideEq: string;
  };
  note: string;
  source: {
    name: string;
    sheet: string;
    unit: string;
  };
}

export interface FoodEmbedding {
  foodId: string;
  vector: number[];
  model: string;
  dimensionality: number;
  normalized: boolean;
}

export interface FoodEmbeddingFile {
  model: string;
  outputDimensionality: number;
  generatedAt: string | null;
  embeddings: FoodEmbedding[];
}

export interface RankedFood {
  food: FoodItem;
  score: number;
  rank: number;
  source: "embedding" | "text" | "manual";
}

export type QuestionKind = "single" | "multi" | "number" | "text";

export interface QuestionOption {
  value: string;
  label: string;
  carbAdjustmentG?: number;
}

export interface QuestionDefinition {
  id: string;
  label: string;
  kind: QuestionKind;
  unit?: string;
  required?: boolean;
  options?: QuestionOption[];
  placeholder?: string;
  defaultValue?: string | number | string[];
}

export interface QuestionAnswer {
  questionId: string;
  label: string;
  value: string | number | string[];
  unit?: string;
  carbAdjustmentG?: number;
}

export interface HandMetrics {
  detected: boolean;
  confidence: number;
  handedness?: string;
  boundingBox?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  palmWidthRatio?: number;
  landmarkCount: number;
}

export interface EstimateComponent {
  label: string;
  foodId?: string;
  grams: number;
  minGrams: number;
  maxGrams: number;
  rationale?: string;
}

export interface WeightEstimate {
  selectedFoodName: string;
  visibleComponents: string[];
  edibleGrams: number;
  minEdibleGrams: number;
  maxEdibleGrams: number;
  confidence: number;
  components: EstimateComponent[];
  rationale: string;
}

export interface CarbComponent {
  label: string;
  food?: FoodItem;
  grams: number;
  minGrams: number;
  maxGrams: number;
  carbsG: number;
  minCarbsG: number;
  maxCarbsG: number;
  source: "llm" | "question";
}

export interface CarbEstimate {
  totalCarbsG: number;
  minCarbsG: number;
  maxCarbsG: number;
  edibleGrams: number;
  minEdibleGrams: number;
  maxEdibleGrams: number;
  components: CarbComponent[];
  rationale: string;
  caution: string;
}
