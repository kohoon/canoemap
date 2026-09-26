import json
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


class HanaroDataTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.data = json.loads((ROOT / "hanaro_stores.geojson").read_text(encoding="utf-8"))
        cls.source = (ROOT / "tools" / "build_map.py").read_text(encoding="utf-8")

    def test_official_snapshot_is_nationwide(self):
        self.assertEqual(self.data["type"], "FeatureCollection")
        self.assertGreaterEqual(len(self.data["features"]), 1000)
        self.assertEqual(self.data["metadata"]["count"], len(self.data["features"]))
        self.assertIn("nhhanaro.co.kr", self.data["metadata"]["sourceUrl"])
        self.assertGreaterEqual(len({f["properties"]["region"] for f in self.data["features"]}), 16)

    def test_store_coordinates_and_ids_are_valid(self):
        ids = set()
        for feature in self.data["features"]:
            lng, lat = feature["geometry"]["coordinates"]
            props = feature["properties"]
            self.assertTrue(32.5 <= lat <= 39.5)
            self.assertTrue(124 <= lng <= 132)
            self.assertTrue(props["name"])
            self.assertNotIn(props["id"], ids)
            ids.add(props["id"])

    def test_map_uses_selected_a_icon_with_lazy_clustering(self):
        self.assertIn("const HANARO_MARKER_SVG", self.source)
        self.assertIn("const hanaroLayer=L.layerGroup().addTo(map)", self.source)
        self.assertIn("const Z_HANARO=10,Z_HANARO_INDIVIDUAL=14", self.source)
        self.assertIn("fetch('./hanaro_stores.geojson?v='+DATAVER.hanaro)", self.source)
        self.assertIn("_hanaroClusterIcon", self.source)

    def test_deploy_and_service_worker_include_data(self):
        workflow = (ROOT / ".github" / "workflows" / "deploy-tour.yml").read_text(encoding="utf-8")
        worker = (ROOT / "service-worker.js").read_text(encoding="utf-8")
        self.assertIn("hanaro_stores.geojson", workflow)
        self.assertIn("hanaro_stores", worker)


if __name__ == "__main__":
    unittest.main()
