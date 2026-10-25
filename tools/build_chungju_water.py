"""Build a compact Chungju Lake shoreline snapshot from OSM relation 1226664.

Refresh deliberately after inspecting the relation geometry and imagery; this
shoreline is not a live water-level boundary.
"""

import json
import urllib.request
import xml.etree.ElementTree as ET
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
URL = (
    "https://nominatim.openstreetmap.org/lookup?osm_ids=R1226664"
    "&polygon_geojson=1&polygon_threshold=0.00005&format=jsonv2"
)
RIVER_WAY = 810284748
UPSTREAM_WATER_WAYS = (366899635, 366899733)


def osm_way(way_id):
    request = urllib.request.Request(
        f"https://api.openstreetmap.org/api/0.6/way/{way_id}/full",
        headers={"User-Agent": "CanoeMap/1.0 (crowd@kakao.com)"},
    )
    with urllib.request.urlopen(request, timeout=30) as response:
        osm = ET.parse(response).getroot()
    nodes = {node.attrib["id"]: [float(node.attrib["lon"]), float(node.attrib["lat"])]
             for node in osm.findall("node")}
    return [nodes[ref.attrib["ref"]] for ref in osm.find("way").findall("nd")]


def main():
    request = urllib.request.Request(URL, headers={"User-Agent": "CanoeMap/1.0 (crowd@kakao.com)"})
    with urllib.request.urlopen(request, timeout=30) as response:
        record = json.load(response)[0]
    geometry = record["geojson"]
    if geometry["type"] != "Polygon" or not geometry["coordinates"]:
        raise RuntimeError("Chungju Lake relation did not return a polygon")
    line = osm_way(RIVER_WAY)
    if len(line) < 500:
        raise RuntimeError("Chungju Lake river centerline is unexpectedly short")
    river_water = [osm_way(way_id) for way_id in UPSTREAM_WATER_WAYS]
    if any(len(ring) < 4 or ring[0] != ring[-1] for ring in river_water):
        raise RuntimeError("Danyang river-water polygons are not closed")
    output = {
        "type": "FeatureCollection",
        "features": [
            {"type": "Feature", "properties": {"name": "충주호", "osm_relation": 1226664,
                                                   "source": "OpenStreetMap contributors (ODbL)"}, "geometry": geometry},
            {"type": "Feature", "properties": {"name": "남한강", "osm_way": RIVER_WAY,
                                                   "source": "OpenStreetMap contributors (ODbL)"},
             "geometry": {"type": "LineString", "coordinates": line}},
            *[{"type": "Feature", "properties": {"name": "남한강 수면", "osm_way": way_id,
                                                    "source": "OpenStreetMap contributors (ODbL)"},
               "geometry": {"type": "Polygon", "coordinates": [ring]}}
              for way_id, ring in zip(UPSTREAM_WATER_WAYS, river_water)],
        ],
    }
    path = ROOT / "chungju_water.geojson"
    path.write_text(json.dumps(output, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    print(f"{path}: {path.stat().st_size} bytes, {sum(map(len, geometry['coordinates']))} shoreline vertices, {len(line)} river vertices")


if __name__ == "__main__":
    main()
