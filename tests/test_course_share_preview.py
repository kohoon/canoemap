import json
import subprocess
import textwrap
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


class CourseSharePreviewTests(unittest.TestCase):
    def test_native_share_receives_the_preview_url_explicitly(self):
        source = (ROOT / "tools" / "build_map.py").read_text(encoding="utf-8")
        self.assertIn("navigator.share({title:'카누맵 · '+info.name,text:summary.join('\\n'),url:u})", source)

    def test_preview_uses_center_crop_safe_layout_and_high_quality_jpeg(self):
        source = (ROOT / "tools" / "build_map.py").read_text(encoding="utf-8")
        self.assertIn("const frame={x:520,y:38,w:590,h:554}", source)
        self.assertIn("_cpRound(ctx,96,42,414,546,26)", source)
        self.assertIn("_cpWrapText(ctx,labels.start", source)
        self.assertIn("_cpWrapText(ctx,labels.end", source)
        self.assertIn("canvas.toDataURL('image/jpeg',.95)", source)

    def test_share_html_contains_course_specific_open_graph_and_safe_redirect(self):
        script = textwrap.dedent(
            """
            import { courseShareHtml, normalizeCourseShareId } from './workers/course-share.mjs';
            const html = courseShareHtml({
              id: 'k1788763953491',
              name: '북한강 <종주> #1',
              km: 22.86,
              shareUrl: 'https://worker.example/c/k1788763953491',
              targetUrl: 'https://canoe.crowdbase.kr/?course=k1788763953491',
              imageUrl: 'https://worker.example/course-preview/k1788763953491.jpg?v=abc',
            });
            console.log(JSON.stringify({
              html,
              valid: normalizeCourseShareId('k1788763953491'),
              invalid: normalizeCourseShareId('k1<script>'),
            }));
            """
        )
        result = subprocess.run(
            ["node", "--input-type=module", "-e", script],
            cwd=ROOT,
            check=True,
            capture_output=True,
            text=True,
        )
        payload = json.loads(result.stdout)
        html = payload["html"]
        self.assertEqual(payload["valid"], "k1788763953491")
        self.assertEqual(payload["invalid"], "")
        self.assertIn("북한강 &lt;종주&gt; #1 · 약 22.86km | 카누맵", html)
        self.assertIn('property="og:image" content="https://worker.example/course-preview/k1788763953491.jpg?v=abc"', html)
        self.assertIn('property="og:image:width" content="1200"', html)
        self.assertIn("location.replace(\"https://canoe.crowdbase.kr/?course=k1788763953491\")", html)
        self.assertNotIn("북한강 <종주>", html)

    def test_static_share_registry_matches_current_course_ids(self):
        geojson = json.loads((ROOT / "data/courses.geojson").read_text(encoding="utf-8"))
        ids = json.loads((ROOT / "data/course_ids.json").read_text(encoding="utf-8"))["ids"]
        expected = {str(ids[f["properties"]["name"]]): f["properties"]["name"] for f in geojson["features"]}
        script = "import { STATIC_COURSE_SHARE as x } from './workers/static-course-share.mjs'; console.log(JSON.stringify(x));"
        result = subprocess.run(
            ["node", "--input-type=module", "-e", script],
            cwd=ROOT,
            check=True,
            capture_output=True,
            text=True,
        )
        actual = json.loads(result.stdout)
        self.assertEqual({key: value["name"] for key, value in actual.items()}, expected)

    def test_worker_checks_current_course_state_before_serving_preview(self):
        worker = (ROOT / "workers/auth-worker.js").read_text(encoding="utf-8")
        self.assertIn('KV.get("course_hidden")', worker)
        self.assertIn('if (!course) return new Response("course not found"', worker)
        self.assertIn('if (!course) return new Response("not found"', worker)
        self.assertIn('await _memberOk(env, uid, body.tok)', worker)
        self.assertIn('course.owner === uid', worker)

    def test_expedition_links_use_stickers_and_open_course_details(self):
        script = textwrap.dedent("""
            import worker from './workers/auth-worker.js';
            const courses = [
              {id: 1790000000010, owner:'admin', name:'엑스페디션#10 동강', km:22, t:1},
              {id: 1790000000011, owner:'admin', name:'엑스페디션#11 북한강', km:25, t:2},
            ];
            const env = {SITE_URL:'https://canoe.crowdbase.kr/', PLACES:{get:async key => key==='courses'?JSON.stringify(courses):null}};
            const output=[];
            for(let n=1;n<=11;n++){
              const response=await worker.fetch(new Request('https://worker.example/e/'+n),env,{});
              output.push({status:response.status,html:await response.text()});
            }
            const direct=await worker.fetch(new Request('https://worker.example/c/k1790000000011'),env,{});
            console.log(JSON.stringify({output,direct:await direct.text()}));
        """)
        result = subprocess.run(["node", "--input-type=module", "-e", script], cwd=ROOT,
                                check=True, capture_output=True, text=True)
        payload = json.loads(result.stdout)
        for n, row in enumerate(payload["output"], 1):
            self.assertEqual(row["status"], 200, n)
            extension = "jpg" if n in (2, 3, 4, 5, 9) else "png"
            self.assertIn(f"assets/expedition/expedition_{n:02d}.{extension}", row["html"])
            self.assertIn("&amp;detail=1", row["html"])
        self.assertIn("assets/expedition/expedition_11.png", payload["direct"])
        self.assertIn('property="og:image:type" content="image/png"', payload["direct"])


if __name__ == "__main__":
    unittest.main()
