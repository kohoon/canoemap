"""가입·참여 신청에서 카페 닉네임을 필수로 요구하지 않는지 확인한다."""

import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


class SignupCopyTest(unittest.TestCase):
    def test_canoemap_signup_asks_for_service_username(self):
        for file_name in ("index.html", "map.html", "tools/build_map.py"):
            text = (ROOT / file_name).read_text(encoding="utf-8")
            self.assertIn("카누맵에서 사용할 사용자명과 필수 동의를 확인해 주세요", text)
            self.assertIn('aria-label="카누맵 사용자명"', text)

    def test_traverse_signup_uses_username_not_cafe_nickname(self):
        page = (ROOT / "soyang-travers/index.html").read_text(encoding="utf-8")
        worker = (ROOT / "workers/auth-worker.js").read_text(encoding="utf-8")
        self.assertIn('label for="userName">카누맵 사용자명', page)
        self.assertIn("name,userName,phone", page)
        self.assertNotIn("카페닉네임", page)
        self.assertNotIn('id="cafeNick"', page)
        self.assertIn('카누맵 사용자명: " + userName', worker)


if __name__ == "__main__":
    unittest.main()
