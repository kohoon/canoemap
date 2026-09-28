import subprocess
import textwrap
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


class MemberSecurityTest(unittest.TestCase):
    def test_explicit_status_and_public_projection(self):
        script = textwrap.dedent(
            """
            import {
              memberRecordIsActive, memberProfile, publicMemberSummary, sessionExpiryIsValid, normalizeLegendPrefs,
              ONBOARDING_VERSION, SESSION_TTL_SECONDS
            } from './workers/member-security.mjs';
            const active = {memberId:'abc123', providerId:'4936913088', nick:'회원', status:'active', loginCount:2, visitCount:3};
            const withdrawn = {...active, status:'withdrawn'};
            if (!memberRecordIsActive(active)) throw new Error('active member rejected');
            // Negative regression: a retained identifier/record must not imply current membership.
            if (memberRecordIsActive(withdrawn)) throw new Error('withdrawn member accepted');
            const out = publicMemberSummary(active);
            if ('providerId' in out || JSON.stringify(out).includes('4936913088')) throw new Error('provider id leaked');
            if (memberProfile(active).onboardingVersion !== ONBOARDING_VERSION) throw new Error('legacy member incorrectly onboarded');
            if (memberProfile({...active, onboardingVersion:0}).onboardingVersion !== 0) throw new Error('new member tutorial suppressed');
            const prefs = normalizeLegendPrefs({hanaro:false,cctv:true,adminRoad:true,broken:'yes'});
            if (JSON.stringify(prefs) !== JSON.stringify({cctv:true,hanaro:false})) throw new Error('legend prefs not normalized');
            if (memberProfile({...active, legendPrefs:{hanaro:false}}).legendPrefs.hanaro !== false) throw new Error('legend prefs omitted');
            const now = 2_000_000_000;
            if (sessionExpiryIsValid(now, now)) throw new Error('expired token accepted');
            if (!sessionExpiryIsValid(now + SESSION_TTL_SECONDS, now)) throw new Error('valid token rejected');
            if (sessionExpiryIsValid(now + SESSION_TTL_SECONDS + 301, now)) throw new Error('overlong token accepted');
            """
        )
        subprocess.run(
            ["node", "--input-type=module", "-e", script],
            cwd=ROOT,
            check=True,
            capture_output=True,
            text=True,
        )

    def test_worker_fails_closed_and_logs_pseudonym(self):
        worker = (ROOT / "workers" / "auth-worker.js").read_text(encoding="utf-8")
        self.assertIn('if (!env.ADMIN_KEY) return false', worker)
        self.assertNotIn('if (!env.ADMIN_KEY) return true', worker)
        self.assertIn('id: current.memberId', worker)
        self.assertIn('b.action === "onboarding-dismiss"', worker)
        self.assertIn('current.onboardingStatus = b.outcome === "completed" ? "completed" : "skipped"', worker)
        self.assertIn('b.action === "legend-prefs"', worker)
        self.assertIn('current.legendPrefs = normalizeLegendPrefs(b.legendPrefs)', worker)
        self.assertIn('url.searchParams.get("expedition")', worker)
        self.assertIn('const userOk = !!uid && await _memberOk(env, uid, url.searchParams.get("tok"))', worker)
        self.assertIn('String(x.owner || "") === "admin" && String(x.name || "").startsWith("엑스페디션")', worker)
        self.assertNotIn('"mc1|"', worker)


if __name__ == "__main__":
    unittest.main()
