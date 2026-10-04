import json
import pathlib
import subprocess
import unittest
ROOT=pathlib.Path(__file__).resolve().parents[1]
class ExpeditionMetadataTests(unittest.TestCase):
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
