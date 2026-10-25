#!/usr/bin/env python3
"""Build bounded, cacheable OSM water-routing tiles from a regional PBF.

Usage: PYTHONPATH=/path/to/pyosmium python tools/build_water_tiles.py INPUT.osm.pbf OUTPUT_DIR
The PBF is an offline build input, never a browser dependency or repository asset.
"""

import argparse
import hashlib
import json
import math
from collections import defaultdict
from pathlib import Path

try:
    import osmium
except ImportError as exc:
    raise SystemExit("Install pyosmium first: python -m pip install osmium") from exc

STEP = 0.25
WATERWAYS = {"river", "stream", "canal"}


def tile_ids(bounds):
    south, west, north, east = bounds
    for y in range(math.floor(south / STEP), math.floor(north / STEP) + 1):
        for x in range(math.floor(west / STEP), math.floor(east / STEP) + 1):
            yield f"{y}_{x}"


def bounds_of(coords):
    return min(p[0] for p in coords), min(p[1] for p in coords), max(p[0] for p in coords), max(p[1] for p in coords)


def split_way(coords):
    """Keep long OSM ways local without inventing geometry at chunk boundaries."""
    start = 0
    for i in range(1, len(coords)):
        if i - start >= 48 or max(abs(coords[i][0] - coords[start][0]), abs(coords[i][1] - coords[start][1])) >= 0.025:
            yield coords[start:i + 1]
            start = i
    if start < len(coords) - 1:
        yield coords[start:]


class WaterHandler(osmium.SimpleHandler):
    def __init__(self):
        super().__init__()
        self.tiles = defaultdict(lambda: {"elements": [], "polygons": []})
        self.geojson = osmium.geom.GeoJSONFactory()
        self.way_count = 0
        self.area_count = 0

    def way(self, obj):
        waterway = obj.tags.get("waterway", "")
        barrier = waterway in {"weir", "dam", "lock_gate"} or obj.tags.get("man_made") == "dam"
        if waterway not in WATERWAYS and not barrier:
            return
        try:
            coords = [[round(n.lat, 7), round(n.lon, 7)] for n in obj.nodes]
        except osmium.InvalidLocationError:
            return
        if len(coords) < 2:
            return
        tags = {k: str(obj.tags[k]) for k in ("waterway", "name", "man_made", "bridge") if k in obj.tags}
        for index, chunk in enumerate(split_way(coords)):
            element = {"id": f"{obj.id}:{index}", "tags": tags, "geometry": chunk}
            for tile_id in tile_ids(bounds_of(chunk)):
                self.tiles[tile_id]["elements"].append(element)
            self.way_count += 1

    def area(self, obj):
        if obj.tags.get("natural") != "water":
            return
        try:
            shape = json.loads(self.geojson.create_multipolygon(obj))
        except (RuntimeError, ValueError):
            return
        polygons = [shape["coordinates"]] if shape["type"] == "Polygon" else shape["coordinates"]
        for rings in polygons:
            # Keep inner islands, so a route cannot cross land inside a lake.
            converted = [[[round(lat, 7), round(lon, 7)] for lon, lat in ring] for ring in rings]
            outer = converted[0] if converted else []
            if len(outer) < 4:
                continue
            item = {"id": obj.id, "outer": outer, "inner": converted[1:]}
            for tile_id in tile_ids(bounds_of(outer)):
                self.tiles[tile_id]["polygons"].append(item)
            self.area_count += 1


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("pbf", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    if not args.pbf.is_file():
        parser.error(f"missing input: {args.pbf}")
    handler = WaterHandler()
    handler.apply_file(str(args.pbf), locations=True)
    args.output.mkdir(parents=True, exist_ok=True)
    source_hash = hashlib.sha256()
    with args.pbf.open("rb") as source:
        for block in iter(lambda: source.read(1024 * 1024), b""):
            source_hash.update(block)
    content_hash = hashlib.sha256()
    manifest = {"schema": 1, "step": STEP, "tiles": {}, "source": args.pbf.name,
                "source_sha256": source_hash.hexdigest()}
    for tile_id, data in sorted(handler.tiles.items()):
        payload = json.dumps(data, ensure_ascii=False, separators=(",", ":"))
        content_hash.update(tile_id.encode("ascii"))
        content_hash.update(payload.encode("utf-8"))
        (args.output / f"{tile_id}.json").write_text(payload, encoding="utf-8")
        manifest["tiles"][tile_id] = {"bytes": len(payload.encode("utf-8")),
                                        "ways": len(data["elements"]), "polygons": len(data["polygons"])}
    manifest["version"] = content_hash.hexdigest()[:16]
    (args.output / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"{handler.way_count} ways, {handler.area_count} polygons, {len(handler.tiles)} tiles")


if __name__ == "__main__":
    main()
