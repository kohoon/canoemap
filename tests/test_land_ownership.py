import subprocess
import textwrap
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


class LandOwnershipTest(unittest.TestCase):
    def test_normalizes_owner_category_without_identity(self):
        script = textwrap.dedent(
            """
            import { classifyLandOwner, normalizeLandOwnership, validLandOwnershipPoint } from './workers/land-ownership.mjs';
            if (!validLandOwnershipPoint(37.947, 127.716)) throw new Error('valid Korea point rejected');
            if (validLandOwnershipPoint(0, 0)) throw new Error('out-of-range point accepted');
            if (classifyLandOwner('02', '국유지').category !== 'national') throw new Error('national mapping');
            if (classifyLandOwner('04', '시, 도유지').category !== 'public') throw new Error('public mapping');
            if (classifyLandOwner('01', '개인').category !== 'private') throw new Error('private mapping');
            const parcel = {response:{result:{featureCollection:{features:[{
              geometry:{type:'Polygon',coordinates:[[[127,37],[128,37],[128,38],[127,37]]]},
              properties:{pnu:'5111025027200670000',addr:'강원특별자치도 춘천시 신북읍 용산리 산 67',jibun:'산67임'}
            }]}}}};
            const ledger = {ladfrlVOList:{ladfrlVOList:[{
              pnu:'5111025027200670000',posesnSeCode:'01',posesnSeCodeNm:'개인',
              lndcgrCodeNm:'임야',lndpclAr:'25686',lastUpdtDt:'2026-09-04',ownerName:'노출 금지'
            }]}};
            const out = normalizeLandOwnership(parcel, ledger);
            if (!out || out.label !== '사유지' || out.area !== 25686) throw new Error('normalization failed');
            if ('ownerName' in out || JSON.stringify(out).includes('노출 금지')) throw new Error('identity leaked');
            """
        )
        subprocess.run(
            ["node", "--input-type=module", "-e", script],
            cwd=ROOT,
            check=True,
            capture_output=True,
            text=True,
        )

    def test_worker_and_map_expose_on_demand_action(self):
        worker = (ROOT / "workers" / "auth-worker.js").read_text(encoding="utf-8")
        source = (ROOT / "tools" / "build_map.py").read_text(encoding="utf-8")
        self.assertIn('url.pathname === "/land-ownership"', worker)
        self.assertIn('await _rateLimited(env, "land_ownership"', worker)
        self.assertIn('id="landOwnBtn"', source)
        self.assertIn("function checkLandOwnership()", source)
        self.assertIn("map.on('popupclose',clearLandOwnership)", source)
        self.assertNotIn("ownerName", source)


if __name__ == "__main__":
    unittest.main()
