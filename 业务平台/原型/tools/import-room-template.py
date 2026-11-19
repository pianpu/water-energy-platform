"""Read the supplied installation workbook; export room fields only, never modify it."""
import argparse
import json
from pathlib import Path
import openpyxl

parser = argparse.ArgumentParser(description="从安装对照表只读导入房间位置，不导入安装或门锁字段。")
parser.add_argument("workbook", type=Path, help="水表电表门锁安装对照表.xlsx的本地路径")
SOURCE = parser.parse_args().workbook
DEST = Path(__file__).resolve().parents[1] / "room-template.js"
book = openpyxl.load_workbook(SOURCE, read_only=True, data_only=True)
rooms = []
for sheet_name, project in [("南苑安装对照", "南苑"), ("紫园安装对照", "紫园")]:
    sheet = book[sheet_name]
    for source_row, row in enumerate(sheet.iter_rows(min_row=3, values_only=True), 3):
        if not isinstance(row[0], (int, float)):
            continue
        building_no = str(row[1]).strip()
        building_label = building_no if building_no.endswith(("幢", "栋")) else building_no + "幢"
        rooms.append({
            "id": "RM" + str(len(rooms) + 1).zfill(6),
            "project": project,
            "buildingNo": building_no,
            "building": project + " · " + building_label,
            "unit": str(row[2] or "").strip(),
            "floor": str(row[3] or "").strip(),
            "number": str(row[4] or "").strip(),
            "sourceSheet": sheet_name,
            "sourceRow": source_row,
        })
keys = [(r["project"], r["buildingNo"], r["unit"], r["floor"], r["number"]) for r in rooms]
assert len(set(keys)) == len(keys), "Duplicate room locations in reference workbook"
assert all(r["number"] and r["unit"] for r in rooms), "Missing room identifiers"
payload = {"version": 1, "sourceName": SOURCE.name, "projects": ["南苑", "紫园"], "buildings": list(dict.fromkeys(r["building"] for r in rooms)), "rooms": rooms}
DEST.write_text("'use strict';\nwindow.RoomTemplate=" + json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + ";\n", encoding="utf-8")
print(json.dumps({"rooms": len(rooms), "buildings": len(payload["buildings"]), "projects": {p: sum(r["project"] == p for r in rooms) for p in payload["projects"]}}, ensure_ascii=False))
