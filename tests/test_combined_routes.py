"""The shared route implementation must ship in every map entry point."""
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parent.parent


class CombinedRouteTests(unittest.TestCase):
    def test_generated_entrypoints_embed_current_implementation(self):
        script = (ROOT / 'tools/combined_routes.js').read_text()
        self.assertIn('Promise.allSettled(refs.map(_resolveCombinedRef))', script)
        self.assertIn("u.searchParams.set('routes', clean.join(','))", script)
        self.assertIn('courseDirectionLayer', script)
        for name in ['index.html', 'map.html', 'test.html', 'tour/legacy.html']:
            html = (ROOT / name).read_text()
            self.assertIn(script, html, name)
            self.assertNotIn('__COMBINED_ROUTES__', html)
            self.assertIn("q.has('routes')", html)
            self.assertIn('코스 묶기', html)


if __name__ == '__main__':
    unittest.main()
