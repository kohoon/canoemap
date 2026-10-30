"""Keep reloads from serving a stale map algorithm while retaining offline fallback."""

from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[1]


class ServiceWorkerCacheTest(unittest.TestCase):
    def test_navigation_revalidates_html_and_keeps_offline_fallback(self):
        source = (ROOT / "service-worker.js").read_text(encoding="utf-8")
        navigation = source.split("async function cachedNavigation(request) {", 1)[1].split("\n}\n", 1)[0]
        self.assertIn("fetch(request, { cache: 'no-store' })", navigation)
        self.assertIn("cache.match('./')", navigation)


if __name__ == "__main__":
    unittest.main()
