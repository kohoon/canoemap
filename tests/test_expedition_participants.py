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
  self.assertEqual(self.run_sort(rows,1),['다람','가람','나래','바람'])
  self.assertEqual(self.run_sort(rows,2),['다람','가람'])
 def test_duplicate_rounds_do_not_increase_count_and_names_do_not_merge(self):
  rows=[{'participantId':p,'nickname':n,'expedition':r} for p,n,r in [('one','나래',1),('one','나래',1),('two','가람',1),('two','가람',2),('three','나래',1),('four','나래님',1)]]
  self.assertEqual(self.run_sort(rows,1),['가람','나래','나래','나래님'])
 def test_renamed_person_keeps_identity_and_latest_nickname(self):
  self.assertEqual(self.run_sort([{'participantId':'one','nickname':'옛이름','expedition':1},{'participantId':'one','nickname':'새이름','expedition':2}]),['새이름'])
 def test_empty_invalid_records_and_absent_round(self):
  self.assertEqual(self.run_sort([]),[])
  self.assertEqual(self.run_sort([{},None,{'participantId':'one','nickname':'가람','expedition':0},{'participantId':'one','nickname':'가람','expedition':'1'}]),[])
  self.assertEqual(self.run_sort([{'participantId':'one','nickname':'가람','expedition':1}],11),[])
 def test_verified_first_round_roster_only(self):
  rows=json.loads((ROOT/'data/expedition_participants.json').read_text())
  self.assertEqual(len(rows),14)
  self.assertEqual(len({r['participantId'] for r in rows}),14)
  self.assertEqual({r['expedition'] for r in rows},{1})
  self.assertEqual({r['nickname'] for r in rows},{'카누맨','카누맨2','용부장','쭈리','쪼리','예건','잠실벗','로쟌','번버리','초코파티','욘니','토끼사냥꾼','요트맨','묵향'})
  self.assertEqual(len(self.run_sort(rows,1)),14)
  self.assertEqual(self.run_sort(rows,2),[])
