import pathlib
import unittest


ROOT = pathlib.Path(__file__).resolve().parents[1]


class LiveLocationFollowTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.source = (ROOT / "tools" / "build_map.py").read_text(encoding="utf-8")

    def test_location_button_starts_continuous_high_accuracy_watch(self):
        self.assertIn("map.locate({watch:true,setView:false", self.source)
        self.assertIn("enableHighAccuracy:true", self.source)
        self.assertIn("maximumAge:1000", self.source)

    def test_existing_marker_and_accuracy_circle_are_updated(self):
        self.assertIn("_locCircle.setLatLng(e.latlng).setRadius(radius)", self.source)
        self.assertIn("_locMarker.setLatLng(e.latlng)", self.source)
        self.assertIn("map.panTo(e.latlng", self.source)

    def test_manual_map_drag_stops_follow_mode(self):
        self.assertIn("function stopLocateFollow()", self.source)
        self.assertIn("map.stopLocate()", self.source)
        self.assertIn("map.on('dragstart',stopLocateFollow)", self.source)

    def test_tracking_state_is_visible_and_accessible(self):
        self.assertIn(".locbtn.active", self.source)
        self.assertIn("aria-pressed", self.source)
        self.assertIn("실시간 위치 추적 중 · '+_locModeLabel[_locMode]+' · 지도를 끌면 종료", self.source)

    def test_location_icon_uses_road_water_and_neutral_modes(self):
        self.assertIn("const MODEL_Y_SVG", self.source)
        self.assertIn('viewBox="0 0 52 82" aria-label="위에서 본 Tesla Model Y"', self.source)
        self.assertIn("const WOODEN_CANOE_SVG", self.source)
        self.assertIn('viewBox="0 0 42 86" aria-label="위에서 본 우든카누"', self.source)
        self.assertIn("mode==='canoe'?WOODEN_CANOE_SVG", self.source)
        self.assertIn("const PERSON_SVG", self.source)
        self.assertIn("function _locModeFromEvidence", self.source)
        self.assertIn("if(speed>=6||roadM<=roadLimit)return 'car'", self.source)
        self.assertIn("if(waterM<=waterLimit)return 'canoe'", self.source)
        self.assertIn("return 'person'", self.source)

    def test_surface_classification_reuses_static_map_data_near_the_user(self):
        self.assertIn("fetch('roads.geojson?v='+DATAVER.roads)", self.source)
        self.assertIn("fetch('rivers.geojson?v='+DATAVER.rivers)", self.source)
        self.assertIn("_locNearbySegments", self.source)
        self.assertIn("map.distance(c,_locSurfaceWindow.center)>2500", self.source)


if __name__ == "__main__":
    unittest.main()
