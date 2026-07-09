import json
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "FoodDataCentral_FNDDS.json"
SRC_OUT = ROOT / "src" / "data" / "foods.json"
PUBLIC_OUT = ROOT / "public" / "data" / "foods.json"
EMBEDDINGS_OUT = ROOT / "public" / "data" / "food-embeddings.json"

NUTRIENTS = {
    1003: "proteinGPer100g",
    1004: "fatGPer100g",
    1005: "carbAvailableGPer100g",
    1008: "energyKcalPer100g",
    1051: "waterGPer100g",
    1079: "fiberGPer100g",
    2000: "totalSugarsGPer100g",
}


def clean(value):
    if value is None:
        return ""
    if isinstance(value, float) and math.isnan(value):
        return ""
    return str(value).strip()


def number(value):
    if value is None:
        return None
    try:
        if math.isnan(value):
            return None
    except TypeError:
        pass
    try:
        return round(float(value), 4)
    except (TypeError, ValueError):
        return None


def nutrients_for(food):
    values = {field: None for field in NUTRIENTS.values()}
    names = {}
    for item in food.get("foodNutrients", []):
        nutrient = item.get("nutrient", {})
        nutrient_id = nutrient.get("id")
        field = NUTRIENTS.get(nutrient_id)
        if not field:
            continue
        values[field] = number(item.get("amount"))
        names[field] = {
            "id": nutrient_id,
            "number": nutrient.get("number"),
            "name": nutrient.get("name"),
            "unitName": nutrient.get("unitName"),
        }
    return values, names


def portions_for(food):
    portions = []
    for portion in sorted(food.get("foodPortions", []), key=lambda item: item.get("sequenceNumber") or 9999):
        gram_weight = number(portion.get("gramWeight"))
        if gram_weight is None or gram_weight <= 0:
            continue
        description = clean(portion.get("portionDescription")) or clean(portion.get("modifier"))
        if not description:
            continue
        portions.append(
            {
                "description": description,
                "gramWeight": gram_weight,
                "sequenceNumber": portion.get("sequenceNumber"),
                "modifier": clean(portion.get("modifier")),
            }
        )
    return portions


def ingredients_for(food):
    ingredients = []
    for item in sorted(food.get("inputFoods", []), key=lambda value: value.get("sequenceNumber") or 9999):
        description = clean(item.get("ingredientDescription") or item.get("foodDescription"))
        if not description:
            continue
        ingredients.append(
            {
                "description": description,
                "ingredientWeight": number(item.get("ingredientWeight")),
                "amount": number(item.get("amount")),
                "portionDescription": clean(item.get("portionDescription")),
            }
        )
    return ingredients


def main():
    raw = json.loads(SOURCE.read_text(encoding="utf-8"))
    source_foods = raw["SurveyFoods"]
    foods = []

    for food in source_foods:
        fdc_id = str(food.get("fdcId"))
        description = clean(food.get("description"))
        if not fdc_id or not description:
            continue

        nutrient_values, nutrient_metadata = nutrients_for(food)
        category = food.get("wweiaFoodCategory") or {}
        group = clean(category.get("wweiaFoodCategoryCode"))
        group_name = clean(category.get("wweiaFoodCategoryDescription"))
        portions = portions_for(food)
        ingredients = ingredients_for(food)
        footnote = clean(food.get("footnote"))

        search_parts = [
            description,
            group_name,
            " ".join(portion["description"] for portion in portions[:6]),
            " ".join(ingredient["description"] for ingredient in ingredients[:8]),
        ]

        foods.append(
            {
                "id": f"fdc-{fdc_id}",
                "foodNo": clean(food.get("foodCode")) or fdc_id,
                "indexNo": fdc_id,
                "fdcId": int(fdc_id),
                "group": group,
                "groupName": group_name,
                "name": description,
                "searchText": " ".join(part for part in search_parts if part),
                "carbAvailableGPer100g": nutrient_values["carbAvailableGPer100g"],
                "carbMonosaccharideEqGPer100g": nutrient_values["totalSugarsGPer100g"],
                "totalSugarsGPer100g": nutrient_values["totalSugarsGPer100g"],
                "fiberGPer100g": nutrient_values["fiberGPer100g"],
                "energyKcalPer100g": nutrient_values["energyKcalPer100g"],
                "proteinGPer100g": nutrient_values["proteinGPer100g"],
                "fatGPer100g": nutrient_values["fatGPer100g"],
                "isEstimated": False,
                "isTrace": False,
                "raw": {
                    "carbAvailable": str(nutrient_values["carbAvailableGPer100g"] or ""),
                    "carbMonosaccharideEq": str(nutrient_values["totalSugarsGPer100g"] or ""),
                },
                "note": footnote,
                "portions": portions,
                "ingredients": ingredients,
                "nutrients": nutrient_metadata,
                "source": {
                    "name": "FoodData Central FNDDS 2021-2023",
                    "dataType": clean(food.get("dataType")),
                    "publicationDate": clean(food.get("publicationDate")),
                    "unit": "per 100 g edible portion",
                },
            }
        )

    payload = json.dumps(foods, ensure_ascii=False, indent=2) + "\n"
    SRC_OUT.parent.mkdir(parents=True, exist_ok=True)
    PUBLIC_OUT.parent.mkdir(parents=True, exist_ok=True)
    SRC_OUT.write_text(payload, encoding="utf-8")
    PUBLIC_OUT.write_text(payload, encoding="utf-8")

    # Existing embeddings are tied to food IDs and must be regenerated for FNDDS IDs.
    EMBEDDINGS_OUT.write_text(
        json.dumps(
            {
                "model": "gemini-embedding-2",
                "outputDimensionality": 768,
                "generatedAt": None,
                "status": "empty",
                "savedAt": None,
                "count": 0,
                "embeddings": [],
            },
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )

    usable = sum(1 for food in foods if food["carbAvailableGPer100g"] is not None)
    print(f"Wrote {len(foods)} FNDDS foods to {SRC_OUT} and {PUBLIC_OUT}")
    print(f"Foods with carbohydrate values: {usable}/{len(foods)}")
    print(f"Reset embeddings at {EMBEDDINGS_OUT}; run npm run data:embeddings again.")


if __name__ == "__main__":
    main()
