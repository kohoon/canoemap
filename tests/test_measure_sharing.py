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
            import { MEASURE_SHARE_CORRECTIONS } from './workers/measure-share-corrections.mjs';
            const path = '_p~iF~ps|U_ulLnnqC_mqNvxq`@';
            if (measurePathPointCount(path) !== 3) throw new Error('valid polyline rejected');
            const clean = normalizeMeasureShare({path, km: 10.126});
            if (!clean || clean.km !== 10.13 || clean.points !== 3) throw new Error('normalization failed');
            const first = await measureShareId(clean), second = await measureShareId(clean);
            if (!/^m[0-9a-f]{20}$/.test(first) || first !== second) throw new Error('short id is invalid or unstable');
            if (normalizeMeasureShare({path: 'not-a-polyline', km: 10})) throw new Error('invalid path accepted');
            if (normalizeMeasureShare({path, km: 0})) throw new Error('zero distance accepted');
            const fixed = normalizeMeasureShare(MEASURE_SHARE_CORRECTIONS.m2cceca43c44ad374740f);
            if (!fixed || fixed.points < 60 || fixed.km !== 28.89) throw new Error('land-crossing correction invalid');
            let index = 0, lat = 0, lng = 0, coords = [];
            function delta() { let result = 0, shift = 0, code; do { code = fixed.path.charCodeAt(index++) - 63; result |= (code & 31) << shift; shift += 5; } while (code >= 32); return (result & 1) ? ~(result >> 1) : (result >> 1); }
            while (index < fixed.path.length) { lat += delta(); lng += delta(); coords.push([lat / 1e5, lng / 1e5]); }
            if (Math.abs(coords[0][0] - 38.1234) > 1e-5 || Math.abs(coords.at(-1)[1] - 127.64428) > 1e-5) throw new Error('correction endpoints changed');
            const rad = (n) => n * Math.PI / 180;
            let meters = 0;
            for (let i = 1; i < coords.length; i++) { const a = coords[i - 1], b = coords[i], dLat = rad(b[0] - a[0]), dLng = rad(b[1] - a[1]), h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(dLng / 2) ** 2; meters += 12742000 * Math.asin(Math.sqrt(h)); }
            if (Math.abs(meters / 1000 - fixed.km) > 0.02) throw new Error('correction distance mismatch');
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
        self.assertIn('MEASURE_SHARE_CORRECTIONS[id]', worker)
        self.assertIn('"Cache-Control": "public, max-age=31536000, immutable"', worker)


if __name__ == "__main__":
    unittest.main()
