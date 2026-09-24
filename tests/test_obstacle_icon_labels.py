import pathlib
import unittest


ROOT = pathlib.Path(__file__).resolve().parents[1]


class ObstacleIconLabelTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.source = (ROOT / "tools" / "build_map.py").read_text(encoding="utf-8")

    def test_only_famous_places_keep_a_permanent_map_name(self):
        self.assertIn("showName=type==='유명지'", self.source)
        self.assertIn("showName?' '+disp:''", self.source)
        self.assertIn("showName?'':' obs-icon-only'", self.source)

    def test_other_obstacles_show_their_name_on_desktop_hover(self):
        self.assertIn("if(!isTouch&&o.type!=='유명지')", self.source)
        self.assertIn("m.bindTooltip(pmEsc(_obDisplayName(o))", self.source)
        self.assertIn("(o&&o.name&&String(o.name).trim())?String(o.name).trim():t.label", self.source)


if __name__ == "__main__":
    unittest.main()
