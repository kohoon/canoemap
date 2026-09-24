import pathlib
import unittest


ROOT = pathlib.Path(__file__).resolve().parents[1]


class AdminCampsiteTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = (ROOT / "tools" / "build_map.py").read_text(encoding="utf-8")
        cls.worker = (ROOT / "workers" / "auth-worker.js").read_text(encoding="utf-8")

    def test_campsite_is_an_icon_only_admin_type(self):
        self.assertIn("'캠핑사이트':{c:'obs-camp',e:'🏕️',label:'캠핑사이트'}", self.client)
        self.assertIn("showName=type==='유명지'", self.client)
        self.assertIn("function _obHasName(ty){ return !!OBS_TYPES[ty]; }", self.client)
        self.assertIn("<div class=\"sg-label\">제목 (선택)</div>", self.client)
        self.assertIn("const nm=(o.name&&String(o.name).trim())", self.client)
        self.assertIn("function _obAdminOnly(o){ return !!o&&o.type==='캠핑사이트'; }", self.client)
        self.assertIn("if(!adminMode)_removeAdminOnlyObstacles()", self.client)
        self.assertIn("if(_obAdminOnly(o)&&!isAdmin())return;", self.client)
        self.assertIn("(_obAdminOnly(o)&&!isAdmin())", self.client)

    def test_public_worker_response_excludes_campsites(self):
        self.assertIn('.filter((x) => x && x.type !== "캠핑사이트")', self.worker)
        self.assertIn('b.action === "list-admin"', self.worker)
        self.assertIn('String(b.adminKey) !== String(env.ADMIN_KEY)', self.worker)
        self.assertIn('"Cache-Control": "no-store"', self.worker)

    def test_every_obstacle_name_is_optional(self):
        self.assertNotIn("if(type==='캠핑사이트'&&!name)", self.client)
        self.assertNotIn("if(type==='식당/카페'&&!name)", self.client)
        self.assertNotIn("name-required", self.worker)


if __name__ == "__main__":
    unittest.main()
