#!/usr/bin/env python3
"""Build lazy-loaded administrative-dong boundaries from the dated admdongkor GeoJSON.

Source: Statistics Korea SGIS boundaries, modified by vuski/admdongkor (CC BY 4.0).
Run with the downloaded HangJeongDong_ver20260701.geojson as the sole argument.
"""
import hashlib
import json
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
VERSION = "2026-07-01"
SOURCE = "https://github.com/vuski/admdongkor/tree/master/ver20260701"


def round_geometry(value):
    if isinstance(value, list) and value and isinstance(value[0], (int, float)):
        return [round(value[0], 5), round(value[1], 5)]
    return [round_geometry(child) for child in value]


def bounds(value, extent):
    if isinstance(value, list) and value and isinstance(value[0], (int, float)):
        x, y = value[:2]
        extent[0] = min(extent[0], x)
        extent[1] = min(extent[1], y)
        extent[2] = max(extent[2], x)
        extent[3] = max(extent[3], y)
    else:
        for child in value:
            bounds(child, extent)


def build(source_path):
    source = source_path.read_bytes()
    features = json.loads(source)["features"]
    output_dir = ROOT / "admin_dong"
    output_dir.mkdir(exist_ok=True)
    chunks = {}
    index = []
    seen = set()
    for feature in features:
        props = feature["properties"]
        code = str(props["adm_cd"])
        sido = str(props["sido"])
        name = str(props["adm_nm"]).strip()
        if not code or not name or code in seen:
            raise ValueError(f"Missing or duplicate administrative-dong code: {code}")
        seen.add(code)
        extent = [float("inf"), float("inf"), float("-inf"), float("-inf")]
        bounds(feature["geometry"]["coordinates"], extent)
        if not all(map(lambda n: abs(n) < 1000, extent)):
            raise ValueError(f"Invalid bounds for {name}: {extent}")
        index.append({"id": code, "name": name, "sido": sido,
                      "lat": round((extent[1] + extent[3]) / 2, 6),
                      "lng": round((extent[0] + extent[2]) / 2, 6)})
        chunks.setdefault(sido, []).append({
            "type": "Feature", "properties": {"adm_cd": code, "adm_nm": name},
            "geometry": {"type": feature["geometry"]["type"],
                         "coordinates": round_geometry(feature["geometry"]["coordinates"])}
        })
    metadata = {"asOf": VERSION, "source": SOURCE,
                "sourceSha256": hashlib.sha256(source).hexdigest(),
                "attribution": "통계청 SGIS · vuski/admdongkor (CC BY 4.0)"}
    (ROOT / "admin_dong_index.json").write_text(
        json.dumps({"metadata": metadata, "items": index}, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    for sido, records in chunks.items():
        (output_dir / f"{sido}.geojson").write_text(
            json.dumps({"type": "FeatureCollection", "features": records}, ensure_ascii=False,
                       separators=(",", ":")), encoding="utf-8")
    print(f"{len(index)} administrative dongs, {len(chunks)} regional chunks")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise SystemExit("usage: build_admin_dong.py HangJeongDong_ver20260701.geojson")
    build(Path(sys.argv[1]))
