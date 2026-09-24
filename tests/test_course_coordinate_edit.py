import json
import subprocess
import textwrap
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

    def test_paroho_correction_removes_the_eastbound_backtrack_once(self):
        script = textwrap.dedent(
            """
            import { applyCourseCorrection, coursePreviewVersionIsCurrent } from './workers/course-corrections.mjs';
            const original = {
              id: 1789008958889, km: 20.21,
              coords: [[38.134919,127.960026],[38.135913,127.962804],[38.136949,127.954275],[38.139435,127.948406]],
              segments: [{name:'출발~도착',km:20.21,mode:'water'}]
            };
            const fixed = applyCourseCorrection(original);
            const twice = applyCourseCorrection(fixed);
            console.log(JSON.stringify({
              fixed, twice,
              oldPreview: coursePreviewVersionIsCurrent('k1789008958889', (Date.UTC(2026,8,24,8,0)).toString(36)),
              newPreview: coursePreviewVersionIsCurrent('k1789008958889', (Date.UTC(2026,8,24,9,0)).toString(36))
            }));
            """
        )
        proc = subprocess.run(
            ["node", "--input-type=module", "-e", script], cwd=ROOT,
            check=True, capture_output=True, text=True,
        )
        result = json.loads(proc.stdout)
        fixed = result["fixed"]
        self.assertEqual(fixed["km"], 19.86)
        self.assertEqual(fixed["segments"][0]["km"], 19.86)
        self.assertLess(fixed["coords"][1][1], 127.961)
        self.assertEqual(result["twice"]["coords"], fixed["coords"])
        self.assertFalse(result["oldPreview"])
        self.assertTrue(result["newPreview"])


if __name__ == "__main__":
    unittest.main()
