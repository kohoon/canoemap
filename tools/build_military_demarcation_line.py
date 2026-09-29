#!/usr/bin/env python3
"""Build the Korean Military Demarcation Line from shared OSM DMZ edges.

The North- and South-side DMZ multipolygons share the actual demarcation
line.  Keeping only those shared ways avoids confusing either DMZ outer edge
with the centre line.
"""

from __future__ import annotations

import json
import urllib.request
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "data" / "military_demarcation_line.geojson"
RELATION_NORTH = 6794200
RELATION_SOUTH = 6794199


def fetch_relation(relation_id: int) -> dict:
    request = urllib.request.Request(
        f"https://api.openstreetmap.org/api/0.6/relation/{relation_id}/full.json",
        headers={"User-Agent": "CanoeMap/1.0 (https://canoe.crowdbase.kr)"},
    )
    with urllib.request.urlopen(request, timeout=60) as response:
        return json.load(response)


def relation_way_ids(payload: dict, relation_id: int) -> set[int]:
    relation = next(
        item for item in payload["elements"]
        if item["type"] == "relation" and item["id"] == relation_id
    )
    return {
        member["ref"] for member in relation["members"]
        if member["type"] == "way" and member.get("role") == "outer"
    }


def shared_segments(north: dict, south: dict) -> list[list[list[float]]]:
    shared = relation_way_ids(north, RELATION_NORTH) & relation_way_ids(south, RELATION_SOUTH)
    nodes = {
        item["id"]: [item["lon"], item["lat"]]
        for item in north["elements"] if item["type"] == "node"
    }
    return [
        [nodes[node_id] for node_id in item["nodes"]]
        for item in north["elements"]
        if item["type"] == "way" and item["id"] in shared
    ]


def chain_segments(segments: list[list[list[float]]]) -> list[list[float]]:
    remaining = [segment[:] for segment in segments]
    chain = remaining.pop(0)
    while remaining:
        joined = False
        for index, segment in enumerate(remaining):
            if chain[-1] == segment[0]:
                chain.extend(segment[1:])
            elif chain[-1] == segment[-1]:
                chain.extend(reversed(segment[:-1]))
            elif chain[0] == segment[-1]:
                chain = segment[:-1] + chain
            elif chain[0] == segment[0]:
                chain = list(reversed(segment[1:])) + chain
            else:
                continue
            remaining.pop(index)
            joined = True
            break
        if not joined:
            raise RuntimeError(f"Military demarcation line has {len(remaining)} disconnected segments")
    if chain[0][0] > chain[-1][0]:
        chain.reverse()
    return chain


def main() -> None:
    north = fetch_relation(RELATION_NORTH)
    south = fetch_relation(RELATION_SOUTH)
    coordinates = chain_segments(shared_segments(north, south))
    output = {
        "type": "FeatureCollection",
        "metadata": {
            "source": "OpenStreetMap",
            "sourceRelations": [RELATION_NORTH, RELATION_SOUTH],
            "method": "shared outer ways of the North and South Korean DMZ relations",
        },
        "features": [{
            "type": "Feature",
            "properties": {"name": "군사분계선", "kind": "military_demarcation_line"},
            "geometry": {"type": "LineString", "coordinates": coordinates},
        }],
    }
    OUTPUT.write_text(json.dumps(output, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"군사분계선 {len(coordinates):,}개 좌표 → {OUTPUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
