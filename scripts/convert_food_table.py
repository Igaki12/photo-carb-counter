import json
import math
import re
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "日本食品標準成分表-炭水化物編_2023.xlsx"
OUT = ROOT / "src" / "data" / "foods.json"
PUBLIC_OUT = ROOT / "public" / "data" / "foods.json"

GROUP_NAMES = {
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


def clean_text(value):
    if value is None:
        return ""
    if isinstance(value, float) and math.isnan(value):
        return ""
    return str(value).replace("\u3000", " ").strip()


def parse_number(value):
    raw = clean_text(value)
    if raw in {"", "-", "nan"}:
        return {"value": None, "isEstimated": False, "isTrace": False, "raw": raw}
    if raw == "Tr":
        return {"value": 0, "isEstimated": False, "isTrace": True, "raw": raw}

    is_estimated = raw.startswith("(") and raw.endswith(")")
    normalized = raw.strip("()")
    try:
        return {
            "value": float(normalized),
            "isEstimated": is_estimated,
            "isTrace": False,
            "raw": raw,
        }
    except ValueError:
        return {"value": None, "isEstimated": is_estimated, "isTrace": False, "raw": raw}


def normalize_id(value, width):
    text = clean_text(value)
    if re.fullmatch(r"\d+(\.0)?", text):
        text = str(int(float(text)))
    return text.zfill(width)


def main():
    df = pd.read_excel(SOURCE, sheet_name="表全体", header=None, skiprows=6)
    foods = []

    for _, row in df.iterrows():
        group = normalize_id(row.iloc[0], 2)
        food_no = normalize_id(row.iloc[1], 5)
        index_no = clean_text(row.iloc[2])
        name = clean_text(row.iloc[3])
        if not food_no or not name:
            continue

        carb_mono = parse_number(row.iloc[5])
        carb_available = parse_number(row.iloc[14])
        note = clean_text(row.iloc[17])

        foods.append(
            {
                "id": f"food-{food_no}",
                "foodNo": food_no,
                "indexNo": index_no,
                "group": group,
                "groupName": GROUP_NAMES.get(group, f"{group}群"),
                "name": name,
                "searchText": " ".join(part for part in [name, note] if part),
                "carbAvailableGPer100g": carb_available["value"],
                "carbMonosaccharideEqGPer100g": carb_mono["value"],
                "isEstimated": carb_available["isEstimated"] or carb_mono["isEstimated"],
                "isTrace": carb_available["isTrace"] or carb_mono["isTrace"],
                "raw": {
                    "carbAvailable": carb_available["raw"],
                    "carbMonosaccharideEq": carb_mono["raw"],
                },
                "note": note,
                "source": {
                    "name": "日本食品標準成分表（八訂）増補2023年 炭水化物成分表",
                    "sheet": "表全体",
                    "unit": "可食部100 g当たり",
                },
            }
        )

    payload = json.dumps(foods, ensure_ascii=False, indent=2) + "\n"
    OUT.parent.mkdir(parents=True, exist_ok=True)
    PUBLIC_OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(payload, encoding="utf-8")
    PUBLIC_OUT.write_text(payload, encoding="utf-8")
    print(f"Wrote {len(foods)} foods to {OUT} and {PUBLIC_OUT}")


if __name__ == "__main__":
    main()
