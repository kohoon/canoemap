import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


class CourseCoordinateEditTest(unittest.TestCase):
    def test_authorized_course_edit_can_replace_validated_route_geometry(self):
        worker = (ROOT / "workers" / "auth-worker.js").read_text(encoding="utf-8")
        edit_start = worker.index('} else if (b.action === "edit" || b.action === "edituser")')
        add_start = worker.index('} else if (b.action === "add" || b.action === "adduser"', edit_start)
        edit = worker[edit_start:add_start]
        self.assertLess(edit.index("if (!adminOk"), edit.index("if (b.coords != null)"))
        self.assertIn("coords.length < 2", edit)
        self.assertIn("Math.abs(p[0]) > 90", edit)
        self.assertIn("Math.abs(p[1]) > 180", edit)
        self.assertIn("it.coords = coords", edit)
        self.assertIn("savedCourse = it", edit)


if __name__ == "__main__":
    unittest.main()
