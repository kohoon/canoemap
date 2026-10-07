import json
import pathlib
import subprocess
import unittest
ROOT=pathlib.Path(__file__).resolve().parents[1]
class ExpeditionMetadataTests(unittest.TestCase):
 def test_directional_names_follow_actual_route_endpoints(self):
  definitions=json.loads((ROOT/'data/courses_def.json').read_text())
  features=json.loads((ROOT/'data/courses.geojson').read_text())['features']
  expected={
   2:('장회리','서유석낚시터','장회서창길',[128.24650165496178,36.930608379851996],[128.11069884126834,36.95154116554876]),
   3:('대상교','한반도뗏목마을','대상선암길',[128.3361477613411,37.32799985503042],[128.34558842944583,37.22183383403058]),
   8:('천내리','구강리','천내구강길',[127.59394117828307,36.11553689204659],[127.6938428759828,36.15960538756281]),
  }
  script="import {EXPEDITIONS} from './workers/expedition.mjs'; console.log(JSON.stringify(EXPEDITIONS));"
  names=json.loads(subprocess.check_output(['node','--input-type=module','-e',script],cwd=ROOT,text=True))
  browser_source=(ROOT/'tools/build_map.py').read_text()
  for n,(start,end,title,start_point,end_point) in expected.items():
   definition=next(c for c in definitions if c['name']==f'엑스페디션#{n} ({"충주호" if n==2 else "평창강" if n==3 else "금강"})')
   self.assertEqual((definition['points'][0],definition['points'][-1]),(start,end))
   feature=next(f for f in features if f['properties']['name']==definition['name'])
   coords=feature['geometry']['coordinates']
   self.assertEqual(coords[0],start_point)
   self.assertEqual(coords[-1],end_point)
   self.assertEqual(names[str(n)][1],title)
   self.assertIn(f"{n}:[",browser_source)
   self.assertIn(f"'{title}'",browser_source)

 def test_second_expedition_start_and_finish_follow_reversed_route(self):
  definitions=json.loads((ROOT/'data/courses_def.json').read_text())
  course=next(c for c in definitions if c['name']=='엑스페디션#2 (충주호)')
  self.assertEqual(course['points'],['장회리','청풍호펜션','서유석낚시터'])
  features=json.loads((ROOT/'data/courses.geojson').read_text())['features']
  feature=next(f for f in features if f['properties']['name']==course['name'])
  coords=feature['geometry']['coordinates']
  self.assertEqual(len(coords),281)
  self.assertEqual(coords[0],[128.24650165496178,36.930608379851996])
  self.assertEqual(coords[-1],[128.11069884126834,36.95154116554876])
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
  self.assertEqual(d['staticCourse']['name'],'엑스페디션 #2 · 남한강 · 장회서창길')

 def test_twelfth_expedition_name_has_space_before_number(self):
  script="import {normalizeExpedition} from './workers/expedition.mjs'; console.log(normalizeExpedition({id:12,owner:'admin',name:'엑스페디션#12 소양호'},'k12').name);"
  actual=subprocess.check_output(['node','--input-type=module','-e',script],cwd=ROOT,text=True).strip()
  self.assertEqual(actual,'엑스페디션 #12 소양호')
  browser_source=(ROOT/'tools/build_map.py').read_text()
  self.assertIn("(cat==='엑스페디션'?' #':'#')+no",browser_source)
  self.assertIn("'엑스페디션 #12'",browser_source)

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
