import subprocess
import textwrap
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


class MeasureSharingTests(unittest.TestCase):
    def test_measure_payload_validation_and_stable_short_id(self):
        script = textwrap.dedent(
            """
            import { measurePathPointCount, measureShareId, normalizeMeasureShare } from './workers/measure-share.mjs';
            const path = '_p~iF~ps|U_ulLnnqC_mqNvxq`@';
            if (measurePathPointCount(path) !== 3) throw new Error('valid polyline rejected');
            const clean = normalizeMeasureShare({path, km: 10.126});
            if (!clean || clean.km !== 10.13 || clean.points !== 3) throw new Error('normalization failed');
            const first = await measureShareId(clean), second = await measureShareId(clean);
            if (!/^m[0-9a-f]{20}$/.test(first) || first !== second) throw new Error('short id is invalid or unstable');
            if (normalizeMeasureShare({path: 'not-a-polyline', km: 10})) throw new Error('invalid path accepted');
            if (normalizeMeasureShare({path, km: 0})) throw new Error('zero distance accepted');
            """
        )
        subprocess.run(
            ["node", "--input-type=module", "-e", script],
            cwd=ROOT,
            check=True,
            capture_output=True,
            text=True,
        )

    def test_worker_requires_current_member_or_admin_to_create(self):
        worker = (ROOT / "workers" / "auth-worker.js").read_text(encoding="utf-8")
        self.assertIn('url.pathname.endsWith("/measure-share")', worker)
        self.assertIn('const memberOk = !!uid && await _memberOk(env, uid, b.tok);', worker)
        self.assertIn('if (!adminOk && !memberOk)', worker)
        self.assertIn('KV.put("measure_share:" + id', worker)
        self.assertIn('"Cache-Control": "public, max-age=31536000, immutable"', worker)


if __name__ == "__main__":
    unittest.main()
