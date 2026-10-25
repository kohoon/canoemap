"""Danyang underwater-weir restriction stays at the weir, not Jeokseong Bridge."""

import hashlib
import json
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "tools"))
from build_wlz_inland import DANYANG_WEIR_CENTERLINE, buffer_path  # noqa: E402
from trace_course import haversine  # noqa: E402


class DanyangWeirZoneTest(unittest.TestCase):
    def test_centerline_extends_about_500m_each_side(self):
        for points in (DANYANG_WEIR_CENTERLINE[:6], DANYANG_WEIR_CENTERLINE[5:]):
            length = sum(haversine(a, b) for a, b in zip(points, points[1:]))
            self.assertGreater(length, 480)
            self.assertLess(length, 520)

    def test_published_geometry_and_cache_version(self):
        expected = buffer_path(DANYANG_WEIR_CENTERLINE, 328)
        for filename in ("data/wlz_inland.geojson", "wlz.geojson"):
            features = json.loads((ROOT / filename).read_text(encoding="utf-8"))["features"]
            matches = [f for f in features if f["properties"].get("name") == "남한강 단양수중보 구역"]
            self.assertEqual(len(matches), 1, filename)
            self.assertEqual(matches[0]["geometry"]["coordinates"], expected, filename)
        version = hashlib.sha1((ROOT / "wlz.geojson").read_bytes()).hexdigest()[:8]
        for filename in ("index.html", "map.html"):
            self.assertIn(f'wlz:"{version}"', (ROOT / filename).read_text(encoding="utf-8"))


if __name__ == "__main__":
    unittest.main()
