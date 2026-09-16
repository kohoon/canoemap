import pathlib
import unittest


ROOT = pathlib.Path(__file__).resolve().parents[1]


class WaybackLegendTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.source = (ROOT / "tools" / "build_map.py").read_text(encoding="utf-8")

    def test_wayback_entry_is_beside_satellite_choice(self):
        self.assertIn("satLabel.classList.add('sat-base-row')", self.source)
        self.assertIn("open.innerHTML='🕘 과거'", self.source)
        self.assertIn("_openWaybackAtMapCenter()", self.source)

    def test_dam_popup_no_longer_owns_wayback_entry(self):
        self.assertNotIn("dam-wayback", self.source)
        self.assertNotIn("function _openWayback(cd)", self.source)

    def test_opening_uses_current_center_and_switches_basemap(self):
        self.assertIn("const center=map.getCenter()", self.source)
        self.assertIn("if(map.hasLayer(offlineBase)) map.removeLayer(offlineBase)", self.source)
        self.assertIn("localStorage.setItem('mc_basemap','위성지도')", self.source)


if __name__ == "__main__":
    unittest.main()
