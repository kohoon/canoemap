import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


class LayerLegendLayoutTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.source = (ROOT / "tools" / "build_map.py").read_text(encoding="utf-8")

    def test_water_layers_are_grouped_in_one_row(self):
        self.assertIn("['수위','water','lc-water-row']", self.source)
        self.assertIn(".lc-water-row{display:grid;grid-template-columns:.88fr 1.12fr 1fr", self.source)
        self.assertIn(".lc-water-row input[type=checkbox]{width:14px", self.source)
        self.assertIn("_organizeLayerLegend", self.source)

    def test_store_layers_are_grouped_without_map_attribution(self):
        self.assertIn("['편의시설','store','lc-store-row']", self.source)
        self.assertNotIn("addAttribution('다이소 지점", self.source)
        self.assertNotIn("addAttribution('하나로마트", self.source)

    def test_base_map_rows_share_one_alignment_grid(self):
        self.assertIn(".leaflet-control-layers-base>label{display:flex;align-items:center;min-height:28px", self.source)
        self.assertIn(".leaflet-control-layers label{margin:1px 0", self.source)
        self.assertIn(".lc-section{margin-top:4px;padding-top:4px", self.source)
        self.assertIn(".leaflet-control-layers-base .leaflet-control-layers-selector{position:static;margin:0 4px 0 0}", self.source)
        self.assertIn(".wayback-open{display:inline-flex;align-items:center;justify-content:center;flex:none;height:26px", self.source)

    def test_expanded_legend_is_bounded_on_every_viewport(self):
        self.assertIn("var(--app-height) - var(--legend-top-clearance,190px) - 32px", self.source)
        self.assertIn("const ro=new ResizeObserver(syncLegendClearance)", self.source)
        self.assertIn("setLegendOpen(false)", self.source)
        self.assertIn("@media(max-width:520px)", self.source)
        self.assertIn("position:fixed;z-index:1200;left:12px;right:12px", self.source)
        self.assertIn("max-height:min(72dvh,620px,", self.source)
        self.assertIn("grid-template-columns:repeat(2,minmax(0,1fr))", self.source)
        self.assertIn("html.tour-mode .leaflet-control-layers.lc-collapsed{margin-bottom:var(--tour-bar-clearance,80px)", self.source)


if __name__ == "__main__":
    unittest.main()
