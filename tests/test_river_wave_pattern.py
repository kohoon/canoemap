import pathlib
import unittest


ROOT = pathlib.Path(__file__).resolve().parents[1]


class RiverWavePatternTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.source = (ROOT / "tools" / "build_map.py").read_text(encoding="utf-8")

    def test_river_lines_use_approved_sky_blue(self):
        self.assertIn("const RIVER_SKY_COLOR='#bdeeff'", self.source)
        self.assertIn("color:RIVER_SKY_COLOR,weight:6.5", self.source)
        self.assertIn("color:RIVER_SKY_COLOR,weight:7.5", self.source)

    def test_river_lines_include_wave_marks(self):
        self.assertIn("function riverWaveLayer(coords,pane,limit)", self.source)
        self.assertIn('d="M1 7Q5.5 2 10 7T19 7"', self.source)
        self.assertIn('stroke="#fff" stroke-width="2.4"', self.source)
        self.assertIn("riverWaveLayer(ll,'riverSearchPane',5)", self.source)

    def test_map_waves_are_viewport_bounded(self):
        self.assertIn("function _refreshRiverWaveMarks()", self.source)
        self.assertIn("map.getZoom()<9", self.source)
        self.assertIn("map.getZoom()>=11?120:70", self.source)
        self.assertIn("map.on('moveend',_refreshRiverWaveMarks)", self.source)


if __name__ == "__main__":
    unittest.main()
