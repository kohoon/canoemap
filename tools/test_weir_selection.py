import random
import unittest
from weir_selection import _hav_km, select_weirs


class SelectionTests(unittest.TestCase):
    def test_same_as_exhaustive_selection(self):
        rng = random.Random(22)
        points = [(rng.uniform(33, 39), rng.uniform(125, 131)) for _ in range(200)]
        weirs = [dict(nm=str(i), river='river', lat=rng.uniform(33, 39),
                      lng=rng.uniform(125, 131), g='국가' if i % 2 else '지방')
                 for i in range(200)]
        expected = [{k: w[k] for k in ('nm', 'river', 'lat', 'lng')} for w in weirs
                    if any(_hav_km((w['lat'], w['lng']), p) <= (8 if w['g'] == '국가' else 1.5)
                           for p in points)]
        self.assertEqual(select_weirs(weirs, points), expected)

    def test_boundary_and_empty_points(self):
        w = dict(nm='same', river='river', lat=37, lng=127, g='국가')
        self.assertEqual(select_weirs([w], []), [])
        self.assertEqual(len(select_weirs([w], [(37, 127)])), 1)


if __name__ == '__main__':
    unittest.main()
