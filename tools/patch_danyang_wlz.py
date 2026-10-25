#!/usr/bin/env python3
"""Replace only the Danyang underwater-weir polygon in published GeoJSON.

The full inland-zone builder uses remote waterway queries; this deterministic
patch keeps every other published restriction unchanged.
"""

import json
from pathlib import Path

from build_wlz_inland import DANYANG_WEIR_CENTERLINE, buffer_path


ROOT = Path(__file__).resolve().parent.parent
NAME = "남한강 단양수중보 구역"


def main():
    geometry = {"type": "Polygon", "coordinates": buffer_path(DANYANG_WEIR_CENTERLINE, 328)}
    for name in ("data/wlz_inland.geojson", "wlz.geojson"):
        path = ROOT / name
        content = json.loads(path.read_text(encoding="utf-8"))
        matches = [feature for feature in content["features"] if feature["properties"].get("name") == NAME]
        if len(matches) != 1:
            raise ValueError(f"{name}: expected one {NAME}, found {len(matches)}")
        matches[0]["geometry"] = geometry
        path.write_text(json.dumps(content, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
        print(f"Updated {name}")


if __name__ == "__main__":
    main()
