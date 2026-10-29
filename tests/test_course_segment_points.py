import json
import subprocess
import textwrap
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


class CourseSegmentPointTests(unittest.TestCase):
    def test_saved_waypoint_survives_course_api(self):
        script = textwrap.dedent("""
            import worker from './workers/auth-worker.js';
            const values = new Map();
            globalThis.caches = {default:{delete:async()=>true}};
            const env = {ADMIN_KEY:'test-key',PLACES:{
              get:async key=>values.get(key)||null,
              put:async(key,value)=>values.set(key,value)
            }};
            const ctx = {waitUntil:()=>{}};
            const request = new Request('https://worker.example/course',{method:'POST',
              headers:{'Content-Type':'application/json'},
              body:JSON.stringify({action:'add',adminKey:'test-key',name:'구간 테스트',km:3.5,
                coords:[[37.9,127.8],[38.0,128.0]],
                segments:[
                  {name:'출발~경유1',km:1.2,mode:'water',end:[37.95,127.9]},
                  {name:'경유1~도착',km:2.3,mode:'water',end:[200,127.9]}
                ]})
            });
            const saved = await worker.fetch(request,env,ctx);
            if(!saved.ok)throw Error('save failed: '+saved.status);
            const record = (await saved.json()).course;
            const shared = await worker.fetch(new Request('https://worker.example/courses?shared=k'+record.id),env,ctx);
            console.log(JSON.stringify((await shared.json())[0].segments));
        """)
        result = subprocess.run(
            ["node", "--input-type=module", "-e", script],
            cwd=ROOT, check=True, capture_output=True, text=True,
        )
        segments = json.loads(result.stdout)
        self.assertEqual(segments[0]["end"], [37.95, 127.9])
        self.assertNotIn("end", segments[1])
        self.assertEqual([segment["km"] for segment in segments], [1.2, 2.3])


if __name__ == "__main__":
    unittest.main()
