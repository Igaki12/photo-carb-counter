import json
import math
import posixpath
import re
import zipfile
from pathlib import Path
from xml.etree import ElementTree

ROOT = Path(__file__).resolve().parents[1]
FNDDS_SOURCE = ROOT / "FoodDataCentral_FNDDS.json"
MEXT_SOURCE = ROOT / "文部科学省-日本食品標準成分表2023.xlsx"
SRC_OUT = ROOT / "src" / "data" / "foods.json"
PUBLIC_OUT = ROOT / "public" / "data" / "foods.json"

EXPECTED_FNDDS_COUNT = 5432
EXPECTED_MEXT_COUNT = 2538
MEXT_SHEET_NAME = "表全体"
MEXT_CARB_COLUMN = "U"
MEXT_CARB_COMPONENT_ID = "CHOCDF-"

SPREADSHEET_NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
DOCUMENT_REL_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
PACKAGE_REL_NS = "http://schemas.openxmlformats.org/package/2006/relationships"

NUTRIENTS = {
    1003: "proteinGPer100g",
    1004: "fatGPer100g",
    1005: "carbAvailableGPer100g",
    1008: "energyKcalPer100g",
    1051: "waterGPer100g",
    1079: "fiberGPer100g",
    2000: "totalSugarsGPer100g",
}

MEXT_GROUP_NAMES = {
    "01": "穀類",
    "02": "いも及びでん粉類",
    "03": "砂糖及び甘味類",
    "04": "豆類",
    "05": "種実類",
    "06": "野菜類",
    "07": "果実類",
    "08": "きのこ類",
    "09": "藻類",
    "10": "魚介類",
    "11": "肉類",
    "12": "卵類",
    "13": "乳類",
    "14": "油脂類",
    "15": "菓子類",
    "16": "し好飲料類",
    "17": "調味料及び香辛料類",
    "18": "調理済み流通食品類",
}


def clean(value):
    if value is None:
        return ""
    if isinstance(value, float) and math.isnan(value):
        return ""
    return str(value).strip()


def clean_mext_text(value):
    return re.sub(r"\s+", " ", clean(value).replace("\u3000", " ")).strip()


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


def fndds_foods():
    raw = json.loads(FNDDS_SOURCE.read_text(encoding="utf-8"))
    foods = []

    for food in raw["SurveyFoods"]:
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

    if len(foods) != EXPECTED_FNDDS_COUNT:
        raise ValueError(f"Expected {EXPECTED_FNDDS_COUNT} FNDDS foods, found {len(foods)}")
    return foods


def shared_strings(archive):
    try:
        root = ElementTree.parse(archive.open("xl/sharedStrings.xml")).getroot()
    except KeyError:
        return []

    tag = f"{{{SPREADSHEET_NS}}}t"
    return ["".join(node.text or "" for node in item.iter(tag)) for item in root]


def sheet_path(archive, sheet_name):
    workbook = ElementTree.parse(archive.open("xl/workbook.xml")).getroot()
    sheet_tag = f"{{{SPREADSHEET_NS}}}sheet"
    relationship_id = None
    for sheet in workbook.iter(sheet_tag):
        if sheet.get("name") == sheet_name:
            relationship_id = sheet.get(f"{{{DOCUMENT_REL_NS}}}id")
            break
    if not relationship_id:
        raise ValueError(f"Worksheet not found: {sheet_name}")

    relationships = ElementTree.parse(archive.open("xl/_rels/workbook.xml.rels")).getroot()
    relationship_tag = f"{{{PACKAGE_REL_NS}}}Relationship"
    for relationship in relationships.iter(relationship_tag):
        if relationship.get("Id") == relationship_id:
            target = relationship.get("Target")
            if not target:
                break
            return posixpath.normpath(posixpath.join("xl", target))
    raise ValueError(f"Worksheet relationship not found: {sheet_name}")


def cell_text(cell, strings):
    cell_type = cell.get("t")
    value = cell.find(f"{{{SPREADSHEET_NS}}}v")
    if cell_type == "inlineStr":
        return "".join(node.text or "" for node in cell.iter(f"{{{SPREADSHEET_NS}}}t"))
    if value is None or value.text is None:
        return ""
    if cell_type == "s":
        index = int(value.text)
        try:
            return strings[index]
        except IndexError as error:
            raise ValueError(f"Invalid shared string index: {index}") from error
    return value.text


def mext_rows():
    with zipfile.ZipFile(MEXT_SOURCE) as archive:
        strings = shared_strings(archive)
        worksheet_path = sheet_path(archive, MEXT_SHEET_NAME)
        rows = []
        row_tag = f"{{{SPREADSHEET_NS}}}row"
        cell_reference = re.compile(r"^([A-Z]+)\d+$")

        with archive.open(worksheet_path) as worksheet:
            for _, element in ElementTree.iterparse(worksheet, events=("end",)):
                if element.tag != row_tag:
                    continue
                row_number = int(element.get("r", "0"))
                cells = {}
                for cell in element:
                    if cell.tag != f"{{{SPREADSHEET_NS}}}c":
                        continue
                    reference = cell.get("r", "")
                    match = cell_reference.match(reference)
                    if match:
                        cells[match.group(1)] = cell_text(cell, strings)
                if row_number == 12 and clean_mext_text(cells.get(MEXT_CARB_COLUMN)) != MEXT_CARB_COMPONENT_ID:
                    raise ValueError(
                        f"Expected {MEXT_CARB_COMPONENT_ID} in {MEXT_SHEET_NAME}!{MEXT_CARB_COLUMN}12, "
                        f"found {cells.get(MEXT_CARB_COLUMN)!r}"
                    )
                if row_number >= 13:
                    rows.append(cells)
                element.clear()
    return rows


def normalize_code(value, width, label):
    text = clean_mext_text(value)
    if not text.isdigit():
        raise ValueError(f"Invalid {label}: {value!r}")
    return text.zfill(width)


def normalize_index_no(value):
    text = clean_mext_text(value)
    if not re.fullmatch(r"\d{4}(?:-\d+)?", text):
        raise ValueError(f"Invalid MEXT index number: {value!r}")
    return text


def parse_mext_carbohydrate(value, food_no):
    raw = clean_mext_text(value)
    is_estimated = raw.startswith("(") and raw.endswith(")")
    normalized = raw[1:-1].strip() if is_estimated else raw
    normalized = normalized.replace("†", "")
    if normalized == "Tr":
        return 0, is_estimated, True, raw
    try:
        parsed = round(float(normalized), 4)
    except ValueError as error:
        raise ValueError(f"Invalid CHOCDF- value for MEXT food {food_no}: {raw!r}") from error
    if not math.isfinite(parsed) or parsed < 0 or parsed > 100:
        raise ValueError(f"Out-of-range CHOCDF- value for MEXT food {food_no}: {raw!r}")
    return parsed, is_estimated, False, raw


def mext_foods():
    foods = []
    seen_ids = set()

    for row in mext_rows():
        if not clean_mext_text(row.get("B")) and not clean_mext_text(row.get("D")):
            continue
        group = normalize_code(row.get("A"), 2, "MEXT food group")
        food_no = normalize_code(row.get("B"), 5, "MEXT food number")
        index_no = normalize_index_no(row.get("C"))
        name = clean_mext_text(row.get("D"))
        group_name = MEXT_GROUP_NAMES.get(group)
        if not name or not group_name:
            raise ValueError(f"Invalid MEXT food metadata for {food_no}")

        food_id = f"mext-{food_no}"
        if food_id in seen_ids:
            raise ValueError(f"Duplicate MEXT food ID: {food_id}")
        seen_ids.add(food_id)

        carb, is_estimated, is_trace, raw_carb = parse_mext_carbohydrate(row.get(MEXT_CARB_COLUMN), food_no)
        foods.append(
            {
                "id": food_id,
                "foodNo": food_no,
                "indexNo": index_no,
                "group": group,
                "groupName": group_name,
                "name": name,
                "searchText": f"{name} {group_name}",
                "carbAvailableGPer100g": carb,
                "carbMonosaccharideEqGPer100g": None,
                "isEstimated": is_estimated,
                "isTrace": is_trace,
                "raw": {
                    "carbAvailable": raw_carb,
                    "carbMonosaccharideEq": "",
                },
                "note": "",
                "source": {
                    "name": "日本食品標準成分表（八訂）増補2023年",
                    "sheet": MEXT_SHEET_NAME,
                    "unit": "可食部100 g当たり",
                },
            }
        )

    if len(foods) != EXPECTED_MEXT_COUNT:
        raise ValueError(f"Expected {EXPECTED_MEXT_COUNT} MEXT foods, found {len(foods)}")
    return foods


def main():
    fndds = fndds_foods()
    mext = mext_foods()
    foods = [*fndds, *mext]
    food_ids = {food["id"] for food in foods}
    if len(food_ids) != len(foods):
        raise ValueError("Duplicate food IDs found in combined food data")

    payload = json.dumps(foods, ensure_ascii=False, separators=(",", ":")) + "\n"
    SRC_OUT.parent.mkdir(parents=True, exist_ok=True)
    PUBLIC_OUT.parent.mkdir(parents=True, exist_ok=True)
    SRC_OUT.write_text(payload, encoding="utf-8")
    PUBLIC_OUT.write_text(payload, encoding="utf-8")

    usable = sum(1 for food in foods if food["carbAvailableGPer100g"] is not None)
    print(f"Wrote {len(fndds)} FNDDS foods and {len(mext)} MEXT foods")
    print(f"Foods with carbohydrate values: {usable}/{len(foods)}")
    print(f"Wrote minified food data to {SRC_OUT} and {PUBLIC_OUT}")
    print("Preserved existing FNDDS-only embeddings.")


if __name__ == "__main__":
    main()
