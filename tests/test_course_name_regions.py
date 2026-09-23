import pathlib
import json
import subprocess
import unittest


ROOT = pathlib.Path(__file__).resolve().parents[1]
BUILD_MAP = ROOT / "tools" / "build_map.py"


class CourseNameRegionTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.source = BUILD_MAP.read_text(encoding="utf-8")

    @classmethod
    def short_place(cls, label, address=""):
        start = cls.source.index("function _shortCoursePlace(label,addr){")
        end = cls.source.index("\nasync function _coursePointName", start)
        function_source = cls.source[start:end]
        script = function_source + "\nprocess.stdout.write(JSON.stringify(_shortCoursePlace(" + json.dumps(label, ensure_ascii=False) + "," + json.dumps(address, ensure_ascii=False) + ")));"
        return json.loads(subprocess.check_output(["node", "-e", script], text=True))

    def test_labeled_full_address_starts_at_county_without_duplication(self):
        self.assertEqual(
            self.short_place("화천군 - 강원특별자치도 화천군 간동면 구만리 1395-1"),
            "화천군 간동면 구만리 1395-1",
        )

    def test_reverse_geocoded_address_starts_at_city(self):
        self.assertEqual(
            self.short_place("", "강원특별자치도 춘천시 서면 오월리 51-2"),
            "춘천시 서면 오월리 51-2",
        )

    def test_city_district_and_remaining_address_are_preserved(self):
        self.assertEqual(
            self.short_place("", "서울특별시 송파구 잠실동 1-1"),
            "서울특별시 송파구 잠실동 1-1",
        )


if __name__ == "__main__":
    unittest.main()
