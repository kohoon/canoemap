#!/usr/bin/env python3
"""Refresh both official store snapshots, validate, then update map cache keys."""

import hashlib
import json
import re
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
STORES = ("daiso", "hanaro")
MAPS = ("index.html", "map.html", "test.html", "tour/legacy.html")


def validate(new, previous):
    features = new.get("features", [])
    old_count = len(previous["features"])
    if new.get("type") != "FeatureCollection" or len(features) < old_count * .85:
        raise ValueError(f"Incomplete store collection: {len(features)}/{old_count}")
    if new.get("metadata", {}).get("count") != len(features):
        raise ValueError("Store metadata count mismatch")
    old_regions = {f["properties"]["region"] for f in previous["features"]}
    regions = {f["properties"]["region"] for f in features}
    if not old_regions <= regions:
        raise ValueError(f"Missing regions: {old_regions - regions}")
    for f in features:
        lon, lat = f["geometry"]["coordinates"]
        if f["geometry"]["type"] != "Point" or not (124 <= lon <= 132 and 32.5 <= lat <= 39.5):
            raise ValueError("Invalid store coordinates")
        if not f["properties"].get("name"):
            raise ValueError("Missing store name")
    missing = new["metadata"].get("missingOfficialDetails", 0)
    if missing > max(20, len(features) * .02):
        raise ValueError(f"Too many failed store details: {missing}")


def main():
    updates = {}
    hashes = {}
    with tempfile.TemporaryDirectory(prefix="canoemap-stores-") as directory:
        for store in STORES:
            output = Path(directory) / f"{store}_stores.geojson"
            subprocess.run([sys.executable, "-u", str(ROOT / "tools" / f"build_{store}.py"),
                            "--output", str(output)], check=True)
            target = ROOT / output.name
            validate(json.loads(output.read_text()), json.loads(target.read_text()))
            updates[target] = output.read_bytes()
            hashes[store] = hashlib.sha1(updates[target]).hexdigest()[:8]
        # Prepare all files before touching the previous working snapshots.
        for filename in MAPS:
            path = ROOT / filename
            text = path.read_text()
            for store, digest in hashes.items():
                pattern = rf'(\b{store}:\s*")[a-f0-9]+(")'
                text, count = re.subn(pattern, lambda m: m[1] + digest + m[2], text)
                if count != 1:
                    raise ValueError(f"Expected one {store} cache key in {filename}, got {count}")
            updates[path] = text.encode()
        for target, contents in updates.items():
            target.write_bytes(contents)
    print("Both store snapshots validated; map cache keys refreshed.")


if __name__ == "__main__":
    main()
