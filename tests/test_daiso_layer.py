import json
import unittest
from datetime import date, datetime
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


class DaisoDataTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.data = json.loads((ROOT / "daiso_stores.geojson").read_text(encoding="utf-8"))
        cls.source = (ROOT / "tools" / "build_map.py").read_text(encoding="utf-8")

    def test_official_snapshot_is_nationwide_and_has_metadata(self):
        self.assertEqual(self.data["type"], "FeatureCollection")
        self.assertGreaterEqual(len(self.data["features"]), 1500)
        self.assertEqual(self.data["metadata"]["count"], len(self.data["features"]))
        self.assertIn("daiso.co.kr/cs/shop", self.data["metadata"]["sourceUrl"])
        regions = {f["properties"]["region"] for f in self.data["features"]}
        self.assertEqual(len(regions), 17)

    def test_store_coordinates_and_required_fields_are_valid(self):
        keys = set()
        as_of = date.fromisoformat(self.data["metadata"]["asOf"])
        for feature in self.data["features"]:
            lng, lat = feature["geometry"]["coordinates"]
            props = feature["properties"]
            self.assertTrue(32.5 <= lat <= 39.5)
            self.assertTrue(124 <= lng <= 132)
            self.assertTrue(props["name"])
            self.assertTrue(props["address"])
            key = (props["name"].replace(" ", ""), round(lat, 7), round(lng, 7))
            self.assertNotIn(key, keys)
            keys.add(key)
            if props.get("openingDate"):
                self.assertLessEqual(datetime.strptime(props["openingDate"], "%Y%m%d").date(), as_of)

    def test_map_uses_selected_d_icon_with_lazy_clustering(self):
        self.assertIn("const DAISO_MARKER_SVG", self.source)
        self.assertIn("const daisoLayer=L.layerGroup().addTo(map)", self.source)
        self.assertIn("const Z_DAISO=10,Z_DAISO_INDIVIDUAL=14", self.source)
        self.assertIn("fetch('./daiso_stores.geojson?v='+DATAVER.daiso)", self.source)
        self.assertIn("_daisoClusterIcon", self.source)
        self.assertIn("bindTooltip(pmEsc('다이소 '", self.source)

    def test_tour_deploy_and_service_worker_include_store_data(self):
        workflow = (ROOT / ".github" / "workflows" / "deploy-tour.yml").read_text(encoding="utf-8")
        worker = (ROOT / "service-worker.js").read_text(encoding="utf-8")
        self.assertIn("daiso_stores.geojson", workflow)
        self.assertIn("daiso_stores", worker)


if __name__ == "__main__":
    unittest.main()
