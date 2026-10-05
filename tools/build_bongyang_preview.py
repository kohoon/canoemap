#!/usr/bin/env python3
"""Render the corrected Bongyang course share image from its verified route fixture."""

import json
from pathlib import Path

from build_course_previews import render


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "tests/fixtures/course_bongyang_original.json"
OUTPUT = ROOT / "assets/course-previews/k1783312681276.jpg"


def main():
    course = json.loads(SOURCE.read_text(encoding="utf-8"))
    assert course["id"] == 1783312681276 and len(course["coords"]) == 157
    course["coords"].reverse()
    course["id"] = "k" + str(course["id"])
    course["preview_start"] = "기존 도착지"
    course["preview_end"] = "기존 출발지"
    rivers = json.loads((ROOT / "rivers.geojson").read_text(encoding="utf-8"))
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_bytes(render(course, rivers))
    print(f"Generated {OUTPUT} ({OUTPUT.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
