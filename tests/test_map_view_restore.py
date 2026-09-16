import pathlib
import unittest


ROOT = pathlib.Path(__file__).resolve().parents[1]


class MapViewRestoreTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.source = (ROOT / "tools" / "build_map.py").read_text(encoding="utf-8")

    def test_center_and_zoom_are_saved_after_map_moves(self):
        self.assertIn("localStorage.setItem('mc_map_view_v1'", self.source)
        self.assertIn("lat:+c.lat.toFixed(6)", self.source)
        self.assertIn("lng:+c.lng.toFixed(6)", self.source)
        self.assertIn("zoom:map.getZoom()", self.source)

    def test_share_urls_take_priority_over_saved_view(self):
        for parameter in ("course", "measure", "place", "river"):
            self.assertIn(f"q.has('{parameter}')", self.source)
        self.assertIn("q.get('view')==='roadview'", self.source)
        self.assertIn("if(_mapUrlOwnsView())return null", self.source)


if __name__ == "__main__":
    unittest.main()
