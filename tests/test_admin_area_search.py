from pathlib import Path
import json
import unittest


ROOT = Path(__file__).resolve().parents[1]


class AdministrativeAreaSearchTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.source = (ROOT / "tools" / "build_map.py").read_text(encoding="utf-8")

    def test_all_administrative_levels_are_searched(self):
        self.assertIn("levels=['L1','L2','L3','L4']", self.source)
        self.assertIn("_riCandidates(q,rawGeo)", self.source)
        self.assertIn("<div class=\"sr-head\">행정구역</div>", self.source)
        self.assertIn("admin=await _hjdSearch(q)", self.source)
        self.assertIn("'법정동'", self.source)
        self.assertIn("+' · 행정동 ('", self.source)

    def test_selection_loads_real_boundary_layers(self):
        for layer in ("LT_C_ADSIDO_INFO", "LT_C_ADSIGG_INFO", "LT_C_ADEMD_INFO", "LT_C_ADRI_INFO"):
            self.assertIn(layer, self.source)
        self.assertIn("highlightAdministrativeArea(x)", self.source)
        self.assertIn("map.fitBounds(b,{padding:[32,32],maxZoom:maxZoom})", self.source)
        self.assertIn("adminLevel:'L2GROUP'", self.source)
        self.assertIn("adminPoints:g.map", self.source)
        self.assertIn("x.adminLevel==='L3'?'LT_C_ADEMD_INFO':'LT_C_ADRI_INFO'", self.source)
        self.assertIn("if(x.adminLevel==='HJD')features.push(await _loadHjdFeature(x))", self.source)

    def test_administrative_dong_index_and_regions_are_complete(self):
        index = json.loads((ROOT / "admin_dong_index.json").read_text(encoding="utf-8"))
        items = index["items"]
        self.assertGreater(len(items), 3500)
        self.assertEqual(len(items), len({x["id"] for x in items}))
        self.assertEqual(index["metadata"]["asOf"], "2026-07-01")
        self.assertTrue(any(x["name"].endswith("청운효자동") for x in items))
        self.assertEqual({x["sido"] for x in items},
                         {p.stem for p in (ROOT / "admin_dong").glob("*.geojson")})
        for p in (ROOT / "admin_dong").glob("*.geojson"):
            ids = {x["properties"]["adm_cd"] for x in json.loads(p.read_text(encoding="utf-8"))["features"]}
            self.assertEqual(ids, {x["id"] for x in items if x["sido"] == p.stem})

    def test_highlight_is_non_blocking_and_can_be_closed(self):
        self.assertIn("_adminAreaPane.style.pointerEvents='none'", self.source)
        self.assertIn("aria-label=\"행정구역 강조 해제\"", self.source)
        self.assertIn("clearAdministrativeArea", self.source)

    def test_selected_b_design_uses_white_halo_and_teal_center_without_fill(self):
        self.assertIn("color:'#fff',weight:10,opacity:.92,fill:false", self.source)
        self.assertIn("color:'#00a8b5',weight:4,opacity:1,fill:false", self.source)

    def test_display_geometry_removes_holes_and_dominant_mainland_fragments(self):
        self.assertIn("function _adminDisplayGeometry(geometry)", self.source)
        self.assertIn("largest/total>=.97", self.source)
        self.assertIn("coordinates:kept.map(function(p){return [p[0]];})", self.source)
        self.assertIn("features:features.map(function(f){return _adminDisplayFeature(f,x.disp);})", self.source)

    def test_border_counties_are_clipped_to_the_military_demarcation_line(self):
        self.assertIn("const MILITARY_DEMARCATION_LINE = __MILITARY_DEMARCATION_LINE__", self.source)
        self.assertIn("function _clipAdminRingToMdl(ring,line)", self.source)
        self.assertIn("파주시|연천군|철원군|화천군|양구군|인제군|고성군", self.source)
        self.assertIn("_adminDisplayFeature(f,x.disp)", self.source)


if __name__ == "__main__":
    unittest.main()
