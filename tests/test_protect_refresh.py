import hashlib
import json
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'tools'))
from refresh_protect import collect, display_geometry, is_protection, validate_snapshot, write_snapshot
from shapely.geometry import shape


def feature(identity='48700001273020260091UMI1000001001', code='UMI100'):
    return {
        'type': 'Feature',
        'properties': {'mnum': identity, 'ucode': code, 'sido_name': '전남광주통합특별시', 'sigg_name': '구례군', 'uname': '상수원보호구역', 'dyear': '2026', 'dnum': '0091'},
        'geometry': {'type': 'Polygon', 'coordinates': [[[127, 35], [127.01, 35], [127.01, 35.01], [127, 35.01], [127, 35]]]},
    }


def response(items, total=None):
    return {'response': {'status': 'OK', 'record': {'total': str(len(items) if total is None else total), 'current': str(len(items))}, 'result': {'featureCollection': {'features': items}}}}


class ProtectionRefreshTests(unittest.TestCase):
    def test_excludes_factories_other_rules_and_unknown_types(self):
        for code in ['UM1100', 'UMI999', '']:
            self.assertFalse(is_protection({'ucode': code, 'mnum': '14800001273020130002UM11000001001'}))
        self.assertTrue(is_protection({'mnum': '48700001273020260091UMI1000001001'}))
        pages = {1: response([feature()], 3), 2: response([feature('factory', 'UM1100'), feature('other', 'UMI999')], 3)}
        result = collect(pages.__getitem__)
        self.assertEqual(len(result['features']), 1)
        self.assertEqual(result['metadata']['excludedOtherRegulations'], 2)
        self.assertEqual(result['features'][0]['properties']['dnum'], '0091')

    def test_rejects_api_errors_repeated_pages_and_changing_counts(self):
        cases = [
            {1: {'response': {'status': 'ERROR'}}},
            {1: response([feature()], 2), 2: response([feature()], 2)},
            {1: response([feature()], 2), 2: response([feature('other')], 3)},
            {1: response([], 2)},
        ]
        for pages in cases:
            with self.subTest(pages=pages), self.assertRaises(ValueError):
                collect(pages.__getitem__)

    def test_preserves_holes_disjoint_parts_and_tiny_polygons(self):
        first = feature()['geometry']['coordinates']
        hole = [[127.002, 35.002], [127.003, 35.002], [127.003, 35.003], [127.002, 35.003], [127.002, 35.002]]
        tiny = [[[128, 36], [128.00000001, 36], [128.00000001, 36.00000001], [128, 36.00000001], [128, 36]]]
        geometry = {'type': 'MultiPolygon', 'coordinates': [[first[0], hole], tiny]}
        actual = display_geometry(geometry)
        self.assertEqual(actual['type'], 'MultiPolygon')
        self.assertEqual(len(actual['coordinates']), 2)
        self.assertEqual(len(actual['coordinates'][0]), 2)
        self.assertTrue(shape(actual).is_valid)
        self.assertGreater(shape(actual).geoms[1].area, 0)
        self.assertLess(shape(actual).hausdorff_distance(shape(geometry)), .00003)

    def test_rejects_invalid_coordinates_and_open_rings(self):
        for change in ['open', 'nan', 'outside']:
            item = feature()
            ring = item['geometry']['coordinates'][0]
            if change == 'open':
                ring.pop()
            elif change == 'nan':
                ring[1][0] = float('nan')
            else:
                ring[1][0] = 0
            with self.subTest(change=change), self.assertRaises(ValueError):
                collect(lambda page: response([item]))

    def test_incomplete_refresh_keeps_every_previous_file(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            previous = {'type': 'FeatureCollection', 'metadata': {'typeCode': 'UMI100'}, 'features': [feature() for _ in range(200)]}
            (root / 'protect_polygons.geojson').write_text(json.dumps(previous))
            for filename in ['index.html', 'map.html', 'test.html', 'tour/legacy.html']:
                path = root / filename
                path.parent.mkdir(exist_ok=True)
                path.write_text('protect:"abcdef12"')
            before = {p: p.read_bytes() for p in root.rglob('*') if p.is_file()}
            incomplete = {'type': 'FeatureCollection', 'metadata': {'typeCode': 'UMI100'}, 'features': [feature() for _ in range(100)]}
            with self.assertRaises(ValueError):
                write_snapshot(incomplete, root)
            self.assertEqual(before, {p: p.read_bytes() for p in root.rglob('*') if p.is_file()})

    def test_published_snapshot_is_typed_and_cache_keys_match(self):
        path = ROOT / 'protect_polygons.geojson'
        snapshot = json.loads(path.read_text())
        self.assertGreater(len(snapshot['features']), 100)
        self.assertTrue(all(f['properties']['ucode'] == 'UMI100' for f in snapshot['features']))
        self.assertEqual(snapshot['metadata']['count'], len(snapshot['features']))
        digest = hashlib.sha1(path.read_bytes()).hexdigest()[:8]
        for filename in ['index.html', 'map.html', 'test.html', 'tour/legacy.html']:
            self.assertIn('protect:"' + digest + '"', (ROOT / filename).read_text())


if __name__ == '__main__':
    unittest.main()
