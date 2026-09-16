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
              memberRecordIsActive, publicMemberSummary, sessionExpiryIsValid,
              SESSION_TTL_SECONDS
            } from './workers/member-security.mjs';
            const active = {memberId:'abc123', providerId:'4936913088', nick:'회원', status:'active', loginCount:2, visitCount:3};
            const withdrawn = {...active, status:'withdrawn'};
            if (!memberRecordIsActive(active)) throw new Error('active member rejected');
            // Negative regression: a retained identifier/record must not imply current membership.
            if (memberRecordIsActive(withdrawn)) throw new Error('withdrawn member accepted');
            const out = publicMemberSummary(active);
            if ('providerId' in out || JSON.stringify(out).includes('4936913088')) throw new Error('provider id leaked');
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
        self.assertNotIn('"mc1|"', worker)


if __name__ == "__main__":
    unittest.main()
