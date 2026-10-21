"""Build a compact local Soyang Lake shoreline snapshot from OSM relation 48582.

The snapshot keeps route drawing usable when public Overpass instances are slow or
return an empty response. Refresh deliberately after inspecting imagery and the
relation geometry; this is not a live water-level boundary.
"""

import json
import urllib.request
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
URL = (
    "https://nominatim.openstreetmap.org/lookup?osm_ids=R48582"
    "&polygon_geojson=1&polygon_threshold=0.00005&format=jsonv2"
)


def main():
    request = urllib.request.Request(URL, headers={"User-Agent": "CanoeMap/1.0 (crowd@kakao.com)"})
    with urllib.request.urlopen(request, timeout=30) as response:
        record = json.load(response)[0]
    geometry = record["geojson"]
    if geometry["type"] != "Polygon" or not geometry["coordinates"]:
        raise RuntimeError("Soyang Lake relation did not return a polygon")
    output = {
        "type": "FeatureCollection",
        "features": [{
            "type": "Feature",
            "properties": {"name": "소양호", "osm_relation": 48582, "source": "OpenStreetMap contributors (ODbL)"},
            "geometry": geometry,
        }],
    }
    path = ROOT / "soyang_water.geojson"
    path.write_text(json.dumps(output, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    print(f"{path}: {path.stat().st_size} bytes, {sum(map(len, geometry['coordinates']))} vertices")


if __name__ == "__main__":
    main()
