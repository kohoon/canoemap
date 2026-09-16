import pathlib
import unittest


ROOT = pathlib.Path(__file__).resolve().parents[1]
BUILD_MAP = ROOT / "tools" / "build_map.py"


class MeasureSegmentLabelTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.source = BUILD_MAP.read_text(encoding="utf-8")

    def test_label_uses_segment_endpoint_and_two_distance_rows(self):
        self.assertIn("const end=coords[coords.length-1], n=i+1;", self.source)
        self.assertIn("class=\"meas-seg-net\"", self.source)
        self.assertIn("class=\"meas-seg-cum\"", self.source)
        self.assertIn("Σ 누적 ", self.source)
        self.assertNotIn("function _segMid(coords)", self.source)

    def test_draft_and_finished_labels_receive_cumulative_distance(self):
        self.assertGreaterEqual(self.source.count("cumulativeKm+=sg.km;"), 2)
        self.assertIn("_addSegLabel(measDraft,sg.coords,i,sg.km,cumulativeKm);", self.source)
        self.assertIn("_addSegLabel(grp,sg.coords,i,sg.km,cumulativeKm);", self.source)

    def test_delete_pill_is_below_the_final_endpoint(self):
        self.assertIn("iconAnchor:[32,-12]", self.source)


if __name__ == "__main__":
    unittest.main()
