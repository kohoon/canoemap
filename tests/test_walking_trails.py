"""Keep official walking geometry present in every published map entry point."""
import json
import math
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parent.parent


class WalkingTrailTests(unittest.TestCase):
    def test_official_botdorang_geometry_and_published_maps(self):
        collection = json.loads((ROOT / 'data/walking_trails.geojson').read_text())
        trail = collection['features'][0]
        props = trail['properties']
        self.assertEqual(props['sourceTitle'], '울진군 고시 제2026-180호')
        self.assertEqual(props['designatedDistanceKm'], 3.10)
        self.assertEqual(props['mode'], 'walking')
        self.assertEqual(props['type'], '육로')
        self.assertEqual(trail['geometry']['type'], 'MultiLineString')
        distance = 0
        for line in trail['geometry']['coordinates']:
            self.assertGreaterEqual(len(line), 2)
            for lng, lat in line:
                self.assertTrue(129.34 < lng < 129.37 and 36.92 < lat < 36.95)
            for (x1, y1), (x2, y2) in zip(line, line[1:]):
                dx = math.radians(x2 - x1) * math.cos(math.radians((y1 + y2) / 2))
                dy = math.radians(y2 - y1)
                segment = 6371 * math.hypot(dx, dy)
                self.assertLess(segment, .1)
                distance += segment
        self.assertTrue(3.0 < distance < 3.2)
        for filename in ['index.html', 'map.html', 'test.html', 'tour/legacy.html']:
            html = (ROOT / filename).read_text()
            embedded = html.split('const WALKING_TRAILS = ', 1)[1].split(';\n', 1)[0]
            self.assertEqual(json.loads(embedded), collection, filename)
            self.assertIn('walkingTrailLayer=L.layerGroup().addTo(obstacleLayer)', html)
            self.assertIn("dashArray:'8 6'", html)
            self.assertIn('function walkingTrailUrl(id)', html)
            self.assertIn("q.has('trail')", html)


if __name__ == '__main__':
    unittest.main()
