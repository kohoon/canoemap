import importlib.util
import json
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('school_caption_builder', ROOT / 'tools/build_school_subtitles.py')
builder = importlib.util.module_from_spec(spec)
spec.loader.exec_module(builder)


class CaptionTimingTests(unittest.TestCase):
    def test_word_times_and_silence_survive_caption_conversion(self):
        data = {'events': [
            {'tStartMs': 1000, 'dDurationMs': 9000, 'segs': [{'utf8': 'Keep '}, {'utf8': 'the ', 'tOffsetMs': 200}, {'utf8': 'paddle ', 'tOffsetMs': 400}, {'utf8': 'shaft ', 'tOffsetMs': 600}, {'utf8': 'vertical.', 'tOffsetMs': 900}]},
            {'tStartMs': 2100, 'dDurationMs': 1000, 'aAppend': 1, 'segs': [{'utf8': '\n'}]},
            {'tStartMs': 6000, 'dDurationMs': 2000, 'segs': [{'utf8': 'Rotate your torso and look ahead.'}]},
        ]}
        cues = builder.source_cues(data, 10)
        self.assertEqual(cues[0]['start'], 1)
        self.assertLess(cues[0]['end'], 6)
        self.assertEqual(cues[1]['start'], 6)
        self.assertTrue(all(c['end'] > c['start'] for c in cues))

    def test_glossary_preserves_direction_and_negation(self):
        source = "Do not lock your elbow during the forward stroke on the offside."
        text = builder.terminology(source, 'Forward Stroke')
        self.assertIn('Do not', text)
        self.assertIn('팔꿈치', text)
        self.assertIn('전진 스트로크', text)
        self.assertIn('패들 반대쪽', text)

    def test_published_cues_are_ordered_finite_and_do_not_overlap(self):
        files = list((ROOT / 'paddling/subtitles').glob('*.ko.json'))
        self.assertTrue(files)
        for path in files:
            track = json.loads(path.read_text())
            self.assertEqual(track['videoId'], path.name.split('.')[0])
            self.assertEqual(track['language'], 'ko')
            self.assertTrue(track['cues'])
            previous = -1
            for cue in track['cues']:
                with self.subTest(video=track['videoId'], start=cue['start']):
                    self.assertGreaterEqual(cue['start'], previous)
                    self.assertGreater(cue['end'], cue['start'])
                    self.assertNotIn('CAPTION', cue['text'])
                    self.assertTrue(cue['text'].strip())
                    self.assertIsNone(__import__('re').search(r'[\u3040-\u30ff\u4e00-\u9fff\u0400-\u04ff]', cue['text']))
                    self.assertTrue(__import__('re').search('[가-힣]', cue['text']) or len(cue['text'])<=10)
                    self.assertLessEqual(len(cue['text']), 600)
                    previous = cue['end']


    def test_catalog_registry_and_coverage_are_complete(self):
        import re
        import hashlib
        source = (ROOT / 'paddling/index.html').read_text()
        ids = set(re.findall(r'id:"([A-Za-z0-9_-]{11})",author:', source))
        coverage = json.loads((ROOT / 'paddling/subtitles/coverage.json').read_text())['videos']
        registry_source = (ROOT / 'paddling/subtitle-tracks.js').read_text()
        registry = json.loads(registry_source.split('=', 1)[1].strip().rstrip(';'))
        self.assertEqual(set(coverage), ids)
        self.assertEqual(set(registry), {id for id, item in coverage.items() if item['status'] == 'translated'})
        for id, item in coverage.items():
            self.assertIn(item['status'], ['translated', 'native-korean', 'no-narration', 'unavailable'])
            if id in registry:
                path = ROOT / 'paddling/subtitles' / (id + '.ko.json')
                self.assertEqual(registry[id]['version'], hashlib.sha256(path.read_bytes()).hexdigest()[:12])


if __name__ == '__main__':
    unittest.main()
