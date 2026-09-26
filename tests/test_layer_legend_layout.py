import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


class LayerLegendLayoutTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.source = (ROOT / "tools" / "build_map.py").read_text(encoding="utf-8")

    def test_water_layers_are_grouped_in_one_row(self):
        self.assertIn("['수위','water','lc-water-row']", self.source)
        self.assertIn(".lc-water-row{display:grid;grid-template-columns:repeat(3", self.source)
        self.assertIn("_organizeLayerLegend", self.source)

    def test_store_layers_are_grouped_without_map_attribution(self):
        self.assertIn("['편의시설','store','lc-store-row']", self.source)
        self.assertNotIn("addAttribution('다이소 지점", self.source)
        self.assertNotIn("addAttribution('하나로마트", self.source)


if __name__ == "__main__":
    unittest.main()
