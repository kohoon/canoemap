import pathlib
import unittest


ROOT = pathlib.Path(__file__).resolve().parents[1]
BUILD_MAP = ROOT / "tools" / "build_map.py"


class CourseNameRegionTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.source = BUILD_MAP.read_text(encoding="utf-8")

    def test_province_is_excluded_but_local_suffix_is_preserved(self):
        self.assertIn("!/(특별자치도|도)$/.test(x)", self.source)
        self.assertNotIn("region=p.replace(/[시군구]$/,'')", self.source)

    def test_city_district_can_be_preserved_together(self):
        self.assertIn("if(/시$/.test(p[i])&&p[i+1]&&/구$/.test(p[i+1]))r.push(p[i+1]);", self.source)


if __name__ == "__main__":
    unittest.main()
