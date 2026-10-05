import json
import pathlib
import subprocess
import unittest
ROOT=pathlib.Path(__file__).resolve().parents[1]
class ExpeditionMetadataTests(unittest.TestCase):
 def test_directional_names_follow_actual_route_endpoints(self):
  definitions=json.loads((ROOT/'data/courses_def.json').read_text())
  features=json.loads((ROOT/'data/courses.geojson').read_text())['features']
  places=list(json.loads((ROOT/'data/synced_seqs.json').read_text())['items'].values())
  expected={
   2:('서유석낚시터','장회리','서창장회길'),
   3:('한반도뗏목마을','대상교','선암대상길'),
   8:('구강리','천내리','구강천내길'),
  }
  script="import {EXPEDITIONS} from './workers/expedition.mjs'; console.log(JSON.stringify(EXPEDITIONS));"
  names=json.loads(subprocess.check_output(['node','--input-type=module','-e',script],cwd=ROOT,text=True))
  browser_source=(ROOT/'tools/build_map.py').read_text()
  for n,(start,end,title) in expected.items():
   definition=next(c for c in definitions if c['name']==f'엑스페디션#{n} ({"충주호" if n==2 else "평창강" if n==3 else "금강"})')
   self.assertEqual((definition['points'][0],definition['points'][-1]),(start,end))
   feature=next(f for f in features if f['properties']['name']==definition['name'])
   coords=feature['geometry']['coordinates']
   for name,point in ((start,coords[0]),(end,coords[-1])):
    place=next(p for p in places if name in p.get('name',''))
    self.assertEqual(point,[place['lng'],place['lat']])
   self.assertEqual(names[str(n)][1],title)
   self.assertIn(f"{n}:[",browser_source)
   self.assertIn(f"'{title}'",browser_source)

 def test_second_expedition_start_and_finish_follow_reversed_route(self):
  definitions=json.loads((ROOT/'data/courses_def.json').read_text())
  course=next(c for c in definitions if c['name']=='엑스페디션#2 (충주호)')
  self.assertEqual(course['points'],['서유석낚시터','청풍호펜션','장회리'])
  features=json.loads((ROOT/'data/courses.geojson').read_text())['features']
  feature=next(f for f in features if f['properties']['name']==course['name'])
  coords=feature['geometry']['coordinates']
  self.assertEqual(len(coords),281)
  self.assertEqual(coords[0],[128.11069884126834,36.95154116554876])
  self.assertEqual(coords[-1],[128.24650165496178,36.930608379851996])
  self.assertEqual(feature['properties']['km'],29.5)

 def test_fifth_expedition_start_and_finish_follow_reversed_route(self):
  definitions=json.loads((ROOT/'data/courses_def.json').read_text())
  course=next(c for c in definitions if c['name']=='엑스페디션#5 (금강)')
  self.assertEqual(course['points'],['용담섬바위','소이나루공원'])
  features=json.loads((ROOT/'data/courses.geojson').read_text())['features']
  feature=next(f for f in features if f['properties']['name']==course['name'])
  coords=feature['geometry']['coordinates']
  self.assertEqual(len(coords),147)
  self.assertEqual(coords[0],[127.52921398387444,35.95299045721784])
  self.assertEqual(coords[-1],[127.62041703287937,36.003155387251404])
  self.assertEqual(feature['properties']['km'],22.2)

 def test_sixth_expedition_start_and_finish_follow_reversed_route(self):
  definitions=json.loads((ROOT/'data/courses_def.json').read_text())
  course=next(c for c in definitions if c['name']=='엑스페디션#6 (금강)')
  self.assertEqual(course['points'],['연주리','장계관광지'])
  features=json.loads((ROOT/'data/courses.geojson').read_text())['features']
  feature=next(f for f in features if f['properties']['name']==course['name'])
  coords=feature['geometry']['coordinates']
  self.assertEqual(len(coords),48)
  self.assertEqual(coords[0],[127.66456608011299,36.347173048499286])
  self.assertEqual(coords[-1],[127.63780162082743,36.37801969613553])
  self.assertEqual(feature['properties']['km'],18.5)

 def test_official_rounds_preserve_geometry_distance_and_private_names(self):
  script='''import {normalizeExpedition,EXPEDITIONS} from './workers/expedition.mjs';
const rows=Object.keys(EXPEDITIONS).map(n=>{const c={id:100+Number(n),owner:'admin',name:'엑스페디션#'+n+' 이전 명칭',km:25.13,coords:[[38,127],[37,126]]};return normalizeExpedition(c,'k'+c.id);});
const privateCourse={id:1,owner:'user',name:'엑스페디션#1 개인 코스'};
process.stdout.write(JSON.stringify({rows,privateCourse:normalizeExpedition(privateCourse,'k1'),staticCourse:normalizeExpedition({static:true,id:2,name:'이전 이름'},'2')}));'''
  d=json.loads(subprocess.check_output(['node','--input-type=module','-e',script],cwd=ROOT,text=True))
  self.assertEqual(len(d['rows']),11)
  self.assertEqual(d['rows'][-1]['name'],'엑스페디션 #11 · 북한강 · 구만오월길')
  for i,c in enumerate(d['rows'],1):
   self.assertTrue(c['name'].startswith(f'엑스페디션 #{i} · '));self.assertEqual(c['coords'],[[38,127],[37,126]]);self.assertEqual(c['km'],25.13)
  self.assertEqual(d['privateCourse']['name'],'엑스페디션#1 개인 코스')
  self.assertEqual(d['staticCourse']['name'],'엑스페디션 #2 · 남한강 · 서창장회길')

 def test_korean_date_punctuation_and_ranges(self):
  source=(ROOT/'tools/build_map.py').read_text()
  metadata=source[source.index('const EXPEDITIONS ='):source.index('const _courseByCid=')]+source[source.index('const EXPEDITION_DATES ='):source.index('function _isCourseOwner(')]
  script=metadata+"\nconsole.log(JSON.stringify(Array.from({length:11},(_,i)=>expeditionDateHtml({owner:'admin',name:'엑스페디션 #'+(i+1)},'k1'))));"
  actual=json.loads(subprocess.check_output(['node','-e',script],text=True))
  self.assertIn('2025. 5. 1.</time> ~ <time datetime="2025-05-02">5. 2.</time>',actual[0])
  self.assertIn('2026. 7. 4.</time>',actual[9])
  self.assertIn('2026. 10. 3.</time> ~ <time datetime="2026-10-04">10. 4.</time>',actual[10])
  for html in actual:
   self.assertNotIn(' – ',html)
   self.assertTrue(html.endswith('.</time></div>'))
