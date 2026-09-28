import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


class LegendPreferenceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.source = (ROOT / "tools" / "build_map.py").read_text(encoding="utf-8")

    def test_member_scoped_legend_state_is_restored_and_synced(self):
        self.assertIn("const _legendPrefLayers=", self.source)
        self.assertIn("'mc_legend_prefs_'+String(u.uid)", self.source)
        self.assertIn("action:'legend-prefs'", self.source)
        self.assertIn("_receiveServerLegendPrefs(d.profile.legendPrefs)", self.source)
        self.assertIn("map.on('overlayadd overlayremove'", self.source)

    def test_shared_course_remains_visible_without_overwriting_preference(self):
        self.assertIn("courseRequired=new URLSearchParams(location.search).has('course')", self.source)
        self.assertIn("key==='courses'&&courseRequired", self.source)


if __name__ == "__main__":
    unittest.main()
