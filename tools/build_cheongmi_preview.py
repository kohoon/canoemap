#!/usr/bin/env python3
"""Render the corrected Cheongmi course share image from its verified route fixture."""

import json
from pathlib import Path

from build_course_previews import render


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "tests/fixtures/course_cheongmi_original.json"
OUTPUT = ROOT / "assets/course-previews/k1789437978827.jpg"


def main():
    course = json.loads(SOURCE.read_text(encoding="utf-8"))
    assert course["id"] == 1789437978827 and len(course["coords"]) == 86
    course["coords"].reverse()
    course["id"] = "k" + str(course["id"])
    course["name"] = "청미천 - 여주 원부리 ~ 여주 도리"
    rivers = json.loads((ROOT / "rivers.geojson").read_text(encoding="utf-8"))
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_bytes(render(course, rivers))
    print(f"Generated {OUTPUT} ({OUTPUT.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
