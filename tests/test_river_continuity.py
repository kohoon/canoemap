#!/usr/bin/env python3
"""이름 표기 차이로 주요 하천 검색 결과가 다시 분리되지 않는지 점검한다."""

import json
import math
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from tools.build_rivers import FORCED_EXTENSIONS, normalize_name


def haversine_km(a, b):
    lon1, lat1 = a
    lon2, lat2 = b
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lon2 - lon1)
    h = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 6371 * 2 * math.asin(math.sqrt(h))


def main():
    assert normalize_name("양양 남대천") == "양양남대천"
    data = json.loads((ROOT / "rivers.geojson").read_text(encoding="utf-8"))
    features = [f for f in data["features"] if f["properties"].get("name") == "양양남대천"]
    assert len(features) == 1
    assert not any(f["properties"].get("name") == "양양 남대천" for f in data["features"])

    coords = features[0]["geometry"]["coordinates"]
    lower_end = [128.646165, 38.107106]
    upper_start = [128.644557, 38.10615]
    join = next(i for i, point in enumerate(coords) if point == lower_end)
    assert coords[join + 1] == upper_start
    assert haversine_km(coords[join], coords[join + 1]) < 0.2
    assert min(lat for _, lat in coords) < 37.824
    assert max(lat for _, lat in coords) > 38.108

    illicheon = [f for f in data["features"] if f["properties"].get("name") == "일리천"]
    assert len(illicheon) == 1
    illicheon_coords = illicheon[0]["geometry"]["coordinates"]
    named_end = [127.89414, 37.469201]
    confluence = [127.898118, 37.421672]
    join = illicheon_coords.index(named_end)
    assert illicheon_coords[join + 1] == [127.895214, 37.469172]
    assert haversine_km(illicheon_coords[join], illicheon_coords[join + 1]) < 0.2
    assert illicheon_coords[-1] == confluence

    seomgang = next(f for f in data["features"] if f["properties"].get("name") == "섬강")
    assert confluence in seomgang["geometry"]["coordinates"]
    illicheon_extension = next(x for x in FORCED_EXTENSIONS if x["name"] == "일리천")
    assert illicheon_extension["coordinates"][0] == named_end
    assert illicheon_extension["coordinates"][-1] == confluence
    print("river continuity regression: ok")


if __name__ == "__main__":
    main()
