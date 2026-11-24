import sys
import unittest
from datetime import date
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'tools'))
from audit_regulations import audit_feature

class AuditTests(unittest.TestCase):
    def feature(self):
        return {'properties': {'name': 'test', 'target': '동력수상레저기구',
                               'period': '2023.10.6~2026.10.5'},
                'geometry': {'type': 'Polygon', 'coordinates': [
                    [[127, 35], [128, 35], [128, 36], [127, 36], [127, 35]]]}}

    def test_expired_notice_requires_review_not_automatic_removal(self):
        row = audit_feature(self.feature(), 'inland_leisure', date(2026, 11, 24))
        self.assertIn('stated_period_ended_recheck_notice', row['issues'])
        self.assertEqual(row['canoeApplicability'], 'motor_only_not_canoe_ban')
        self.assertIn('notice_boundary_not_verified', row['issues'])

    def test_future_period_is_not_expired(self):
        row = audit_feature(self.feature(), 'inland_leisure', date(2026, 1, 1))
        self.assertNotIn('stated_period_ended_recheck_notice', row['issues'])

    def test_detects_crossing_geometry_without_repairing_evidence(self):
        feature = self.feature()
        feature['geometry']['coordinates'] = [[[127,35],[128,36],[128,35],[127,36],[127,35]]]
        before = str(feature)
        row = audit_feature(feature, 'water_protection', date(2026, 11, 24))
        self.assertTrue(any(i.startswith('invalid_geometry:') for i in row['issues']))
        self.assertEqual(before, str(feature))

if __name__ == '__main__':
    unittest.main()
