import pathlib
import unittest


ROOT = pathlib.Path(__file__).resolve().parents[1]


class CourseDirectionArrowTests(unittest.TestCase):
    def test_static_and_kv_courses_include_direction_markers(self):
        source = (ROOT / "tools" / "build_map.py").read_text(encoding="utf-8")
        self.assertIn("function courseDirectionLayer(coords)", source)
        self.assertIn("const directions=L.layerGroup();", source)
        self.assertIn("const directions=courseDirectionLayer(coords);", source)
        self.assertIn("L.layerGroup([casing,line,directions,hit])", source)
        self.assertIn("ls:[casing,line,directions,hit]", source)

    def test_arrows_are_repeated_but_bounded(self):
        source = (ROOT / "tools" / "build_map.py").read_text(encoding="utf-8")
        self.assertIn("Math.max(1,Math.min(6,Math.round(total/3500)))", source)
        self.assertIn("_courseBearing(s[0],s[1])", source)
        self.assertIn('class="course-dir-arrow"', source)
        self.assertIn('d="M2 15L9 4 16 15"', source)
        self.assertIn('stroke="#fff" stroke-width="4" stroke-linecap="round"', source)

    def test_arrows_only_show_when_zoomed_in(self):
        source = (ROOT / "tools" / "build_map.py").read_text(encoding="utf-8")
        self.assertIn("const COURSE_DIRECTION_MIN_ZOOM=11", source)
        self.assertIn("map.on('zoomend',_syncCourseDirectionVisibility)", source)
        self.assertIn("#map.course-directions-hidden .course-dir-icon{display:none!important}", source)


if __name__ == "__main__":
    unittest.main()
