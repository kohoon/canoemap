import json
import pathlib
import subprocess
import unittest
ROOT=pathlib.Path(__file__).resolve().parents[1]
class ExpeditionParticipantTests(unittest.TestCase):
 @classmethod
 def run_sort(cls,records,round=None):
  source=(ROOT/'tools/build_map.py').read_text();code=source[source.index('function expeditionParticipantNicknames('):source.index('function expeditionParticipantHtml(')]
  script=code+'\nconsole.log(JSON.stringify(expeditionParticipantNicknames('+json.dumps(records,ensure_ascii=False)+','+json.dumps(round)+')));'
  return json.loads(subprocess.check_output(['node','-e',script],text=True))
 def test_total_count_descending_korean_ties_and_round_filter(self):
  rows=[{'participantId':pid,'nickname':nick,'expedition':n} for pid,nick,rounds in [('a','가람',[1,2]),('b','나래',[1,4]),('d','다람',[1,2,3]),('c','바람',[1])] for n in rounds]
  self.assertEqual(self.run_sort(rows),['다람','가람','나래','바람'])
  self.assertEqual(self.run_sort(rows,1),['가람','나래','다람','바람'])
  self.assertEqual(self.run_sort(rows,2),['가람','다람'])
 def test_duplicate_rounds_do_not_increase_count_and_names_do_not_merge(self):
  rows=[{'participantId':p,'nickname':n,'expedition':r} for p,n,r in [('one','나래',1),('one','나래',1),('two','가람',1),('two','가람',2),('three','나래',1),('four','나래님',1)]]
  self.assertEqual(self.run_sort(rows,1),['가람','나래','나래','나래님'])
 def test_renamed_person_keeps_identity_and_latest_nickname(self):
  self.assertEqual(self.run_sort([{'participantId':'one','nickname':'옛이름','expedition':1},{'participantId':'one','nickname':'새이름','expedition':2}]),['새이름'])
 def test_empty_invalid_records_and_absent_round(self):
  self.assertEqual(self.run_sort([]),[])
  self.assertEqual(self.run_sort([{},None,{'participantId':'one','nickname':'가람','expedition':0},{'participantId':'one','nickname':'가람','expedition':'1'}]),[])
  self.assertEqual(self.run_sort([{'participantId':'one','nickname':'가람','expedition':1}],11),[])
 def test_verified_rosters_and_stable_identity(self):
  rosters=json.loads((ROOT/'tests/fixtures/verified_expedition_rosters.json').read_text())
  rows=json.loads((ROOT/'data/expedition_participants.json').read_text())
  self.assertEqual({r['expedition'] for r in rows},{int(n) for n in rosters})
  self.assertEqual(len(rows),sum(len(names) for names in rosters.values()))
  for n,names in rosters.items():
   actual=[r['nickname'] for r in rows if r['expedition']==int(n)]
   self.assertCountEqual(actual,names);self.assertEqual(len(actual),len(names))
  ids={};rounds={}
  for r in rows:
   ids.setdefault(r['nickname'],set()).add(r['participantId']);rounds.setdefault(r['participantId'],set()).add(r['expedition'])
  self.assertTrue(all(len(person_ids)==1 for person_ids in ids.values()))
  self.assertEqual(len({next(iter(i)) for i in ids.values()}),len(ids))
  for name,person_ids in ids.items():
   expected={int(n) for n,names in rosters.items() if name in names}
   self.assertEqual(rounds[next(iter(person_ids))],expected)
  self.assertNotEqual(ids['카누맨'],ids['카누맨2']);self.assertNotEqual(ids['쭈리'],ids['쪼리'])
  self.assertNotIn('카누맨2',rosters['3']);self.assertIn('J혁스',rosters['2']);self.assertIn('둥글3',rosters['4'])
 def test_no_unknown_round_attendance(self):
  rosters=json.loads((ROOT/'tests/fixtures/verified_expedition_rosters.json').read_text());rows=json.loads((ROOT/'data/expedition_participants.json').read_text())
  self.assertEqual(self.run_sort(rows,max(map(int,rosters))+1),[])

 def test_future_rounds_cannot_change_past_sort(self):
  rows=json.loads((ROOT/'data/expedition_participants.json').read_text())
  for n in range(1,12):
   history=[r for r in rows if r['expedition']<=n]
   self.assertEqual(self.run_sort(rows,n),self.run_sort(history,n))
   future=[{'participantId':r['participantId'],'nickname':r['nickname'],'expedition':100} for r in rows]
   self.assertEqual(self.run_sort(rows,n),self.run_sort(rows+future,n))
