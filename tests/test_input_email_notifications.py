import json
import subprocess
import textwrap
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
WORKER = ROOT / "workers" / "auth-worker.js"
APPS_SCRIPT = ROOT / "integrations" / "google" / "apps_script.gs"


class InputEmailNotificationTests(unittest.TestCase):
    def test_worker_marks_only_new_member_inputs_for_email(self):
        source = WORKER.read_text(encoding="utf-8")

        self.assertEqual(source.count("notify: true"), 2)
        self.assertIn(
            'type: "comment", notify: true, cid: cseq',
            source,
        )
        self.assertIn(
            'type: "suggest", notify: true, cat: kind === "landmark" ? type : kind === "launch" ? "런칭지" : "랜딩지"',
            source,
        )
        self.assertIn('"https://canoe.crowdbase.kr/?pin=" + lat.toFixed(6) + "," + lng.toFixed(6)', source)
        self.assertIn('카누맵에서 찍은 지점: " + mapUrl', source)
        self.assertNotIn(
            'type: "suggest", notify: true,\n          cat: "소양호종주"',
            source,
        )
        self.assertIn("function authorizeNotifications()", APPS_SCRIPT.read_text(encoding="utf-8"))

    def test_apps_script_routes_email_without_breaking_sheet_writes(self):
        harness = textwrap.dedent(
            f"""
            const vm = require("vm");
            const crypto = require("crypto");
            const source = {json.dumps(APPS_SCRIPT.read_text(encoding='utf-8'))};
            const rows = {{}};
            const mails = [];
            const cacheValues = new Map();
            let quota = 20;
            let mailShouldFail = false;
            const sheet = (name) => ({{
              getLastRow: () => (rows[name] || []).length,
              appendRow: (row) => {{ (rows[name] ||= []).push(row); }},
            }});
            const spreadsheet = {{
              getSheetByName: (name) => rows[name] ? sheet(name) : null,
              insertSheet: (name) => {{ rows[name] = []; return sheet(name); }},
              getUrl: () => "https://docs.google.com/spreadsheets/d/test/edit",
            }};
            const sandbox = {{
              SpreadsheetApp: {{ getActiveSpreadsheet: () => spreadsheet }},
              MailApp: {{
                getRemainingDailyQuota: () => quota,
                sendEmail: (message) => {{
                  if (mailShouldFail) throw new Error("mail unavailable");
                  mails.push(message);
                }},
              }},
              CacheService: {{
                getScriptCache: () => ({{
                  get: (key) => cacheValues.get(key) || null,
                  put: (key, value) => cacheValues.set(key, value),
                }}),
              }},
              Utilities: {{
                DigestAlgorithm: {{ SHA_256: "sha256" }},
                Charset: {{ UTF_8: "utf8" }},
                computeDigest: (_algorithm, value) => Array.from(crypto.createHash("sha256").update(value).digest()),
                base64EncodeWebSafe: (bytes) => Buffer.from(bytes).toString("base64url"),
              }},
              ContentService: {{ createTextOutput: (value) => value }},
              console: {{ warn: () => {{}}, error: () => {{}} }},
              Date,
            }};
            vm.createContext(sandbox);
            vm.runInContext(source, sandbox);
            const post = (payload) => sandbox.doPost({{ postData: {{ contents: JSON.stringify(payload) }} }});

            const suggestion = {{
              type: "suggest", notify: true, cat: "정보추가", place: "소양호 선착장",
              nick: "테스터", text: "<새 정보>", lat: 37.9, lng: 127.7,
            }};
            if (post(suggestion) !== "ok") throw new Error("suggestion webhook failed");
            if (mails.length !== 1) throw new Error("new suggestion email missing");
            if (mails[0].to !== "crowd@kakao.com") throw new Error("wrong recipient");
            if (!mails[0].subject.includes("새 건의·정보 추가")) throw new Error("wrong subject");
            if (!mails[0].htmlBody.includes("&lt;새 정보&gt;")) throw new Error("HTML not escaped");
            if (!mails[0].htmlBody.includes("운영 시트에서 확인")) throw new Error("sheet link missing");
            if (!mails[0].htmlBody.includes("https://canoe.crowdbase.kr/?pin=37.900000,127.700000")) throw new Error("exact map link missing");
            if (!mails[0].body.includes("제안자가 찍은 지점: https://canoe.crowdbase.kr/?pin=37.900000,127.700000")) throw new Error("plain location link missing");

            post(suggestion);
            if (mails.length !== 1) throw new Error("duplicate email was not suppressed");
            if (rows.suggestions.length !== 3) throw new Error("duplicate request should still be recorded");

            post({{ type: "comment", place: "백필", nick: "이전회원", text: "과거 코멘트" }});
            post({{ type: "comment", place: "관리자", nick: "📌관리자", text: "운영 메모" }});
            if (mails.length !== 1) throw new Error("backfill/admin comment sent email");

            post({{ type: "comment", notify: true, cid: 8, place: "카누 코스", nick: "회원", text: "좋아요", stars: 5 }});
            if (mails.length !== 2) throw new Error("new member comment email missing");

            quota = 0;
            post({{ type: "suggest", notify: true, cat: "건의", place: "다른 장소", nick: "회원", text: "제안" }});
            if (mails.length !== 2) throw new Error("quota guard failed");

            quota = 20;
            mailShouldFail = true;
            if (post({{ type: "suggest", notify: true, cat: "건의", place: "메일 장애", nick: "회원", text: "제안" }}) !== "ok") {{
              throw new Error("mail failure broke webhook response");
            }}
            if (rows.suggestions.length !== 5) throw new Error("mail failure broke sheet write");
            """
        )
        result = subprocess.run(
            ["node", "-e", harness],
            cwd=ROOT,
            capture_output=True,
            text=True,
        )
        self.assertEqual(result.returncode, 0, result.stderr or result.stdout)


if __name__ == "__main__":
    unittest.main()
