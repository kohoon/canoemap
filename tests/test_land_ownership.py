import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


class LandOwnershipTest(unittest.TestCase):
    def test_map_exposes_on_demand_vworld_jsonp_action(self):
        source = (ROOT / "tools" / "build_map.py").read_text(encoding="utf-8")
        self.assertIn('id="landOwnBtn"', source)
        self.assertIn("function checkLandOwnership()", source)
        self.assertIn("function vworldJsonp(", source)
        self.assertIn("'/ned/data/ladfrlList'", source)
        self.assertIn("'/req/data'", source)
        self.assertIn("map.on('popupclose',function(e){clearLandOwnership()", source)
        self.assertIn("function enableAddressPopupDrag(pop)", source)
        self.assertIn('class="addr-drag-handle"', source)
        self.assertNotIn("ownerName", source)


if __name__ == "__main__":
    unittest.main()
